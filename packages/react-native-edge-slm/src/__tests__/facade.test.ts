import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalAIFacade } from '../LocalAI';
import type { LocalAIEnvironment } from '../environment';
import {
  DeviceUnsupportedError,
  PresetNotFoundError,
  SourceNotConfiguredError,
} from '../errors';
import { InMemoryKeyValueStore } from '../storage/KeyValueStore';
import type { DeviceCapabilities } from '../types/status';
import { NodeDownloadTransport } from './helpers/NodeDownloadTransport';
import { NodeFileStore } from './helpers/NodeFileStore';
import { startStaticServer, type StaticServerControls } from './helpers/staticServer';

const BODY = Buffer.from('model-weights-'.repeat(2048));
const BODY_SHA = createHash('sha256').update(BODY).digest('hex');

const CAPS: DeviceCapabilities = {
  platform: 'android',
  androidApiLevel: 34,
  totalRamBytes: 12 * 1024 ** 3,
  freeStorageBytes: 40 * 1024 ** 3,
  cpuCores: 8,
};

let root: string;
let server: StaticServerControls;
let localAI: LocalAIFacade;
let caps: DeviceCapabilities;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'localai-facade-'));
  server = await startStaticServer(BODY);
  caps = { ...CAPS };
  const env: LocalAIEnvironment = {
    fileStore: new NodeFileStore(root),
    transport: new NodeDownloadTransport(),
    keyValueStore: new InMemoryKeyValueStore(),
    deviceInfo: { getDeviceCapabilities: async () => caps },
  };
  localAI = new LocalAIFacade();
  localAI.configure(env);
});

afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

function registerPreset(overrides: Record<string, unknown> = {}): void {
  localAI.registerPreset({
    id: 'm1',
    displayName: 'Test Model',
    runtime: 'llama.cpp',
    fileName: 'model.gguf',
    ...overrides,
  });
  localAI.configurePresetSource('m1', {
    type: 'url',
    url: server.url,
    allowInsecureHttp: true,
    sha256: BODY_SHA,
  });
}

describe('LocalAI facade lifecycle', () => {
  it('installs, reports installed status, then removes', async () => {
    registerPreset();
    expect(await localAI.getPresetStatus('m1')).toEqual({ state: 'not-installed' });

    const installed = await localAI.installPreset('m1');
    expect(installed.sizeBytes).toBe(BODY.length);

    const status = await localAI.getPresetStatus('m1');
    expect(status.state).toBe('installed');

    await localAI.removePreset('m1');
    expect(await localAI.getPresetStatus('m1')).toEqual({ state: 'not-installed' });
  });

  it('forwards download progress to onProgress', async () => {
    registerPreset();
    const progress: number[] = [];
    await localAI.installPreset('m1', {
      onProgress: (p) => p.progress !== undefined && progress.push(p.progress),
    });
    expect(progress.length).toBeGreaterThan(0);
  });

  it('blocks install on an unsupported device', async () => {
    registerPreset({ minimumDeviceRequirements: { minRamBytes: 999 * 1024 ** 3 } });
    await expect(localAI.installPreset('m1')).rejects.toBeInstanceOf(DeviceUnsupportedError);
    // still not installed
    expect((await localAI.getPresetStatus('m1')).state).not.toBe('installed');
  });

  it('honors skipDeviceCheck', async () => {
    registerPreset({ minimumDeviceRequirements: { minRamBytes: 999 * 1024 ** 3 } });
    const installed = await localAI.installPreset('m1', { skipDeviceCheck: true });
    expect(installed.presetId).toBe('m1');
  });

  it('throws PresetNotFoundError for an unknown preset', async () => {
    await expect(localAI.getPresetStatus('ghost')).rejects.toBeInstanceOf(PresetNotFoundError);
  });

  it('throws SourceNotConfiguredError when no source is set', async () => {
    localAI.registerPreset({
      id: 'nosrc',
      displayName: 'No Source',
      runtime: 'llama.cpp',
      fileName: 'x.gguf',
    });
    await expect(localAI.installPreset('nosrc')).rejects.toBeInstanceOf(SourceNotConfiguredError);
  });

  it('records a failed status when the checksum mismatches', async () => {
    localAI.registerPreset({
      id: 'm1',
      displayName: 'Test Model',
      runtime: 'llama.cpp',
      fileName: 'model.gguf',
    });
    localAI.configurePresetSource('m1', {
      type: 'url',
      url: server.url,
      allowInsecureHttp: true,
      sha256: 'a'.repeat(64),
    });
    await expect(localAI.installPreset('m1')).rejects.toMatchObject({
      code: 'LOCALAI.CHECKSUM_MISMATCH',
    });
    const status = await localAI.getPresetStatus('m1');
    expect(status.state).toBe('failed');
  });

  it('loadPreset requires an installed model', async () => {
    registerPreset();
    await expect(localAI.loadPreset('m1')).rejects.toMatchObject({
      code: 'LOCALAI.MODEL_NOT_INSTALLED',
    });
  });

  it('reports device capabilities from the environment', async () => {
    expect(await localAI.getDeviceCapabilities()).toEqual(caps);
  });

  it('getInstalledModels lists installed models', async () => {
    registerPreset();
    expect(await localAI.getInstalledModels()).toEqual([]);
    await localAI.installPreset('m1');
    const models = await localAI.getInstalledModels();
    expect(models.map((m) => m.presetId)).toEqual(['m1']);
    expect(models[0]?.sha256).toBe(BODY_SHA);
  });

  it('updatePreset is a no-op when the pinned checksum already matches', async () => {
    registerPreset(); // source pins BODY_SHA
    await localAI.installPreset('m1');
    const before = server.requestCount();
    const updated = await localAI.updatePreset('m1');
    expect(updated.sha256).toBe(BODY_SHA);
    expect(server.requestCount()).toBe(before); // nothing re-downloaded
  });

  it('updatePreset re-downloads when the install has no pinned checksum', async () => {
    localAI.registerPreset({
      id: 'm1',
      displayName: 'Test Model',
      runtime: 'llama.cpp',
      fileName: 'model.gguf',
    });
    localAI.configurePresetSource('m1', {
      type: 'url',
      url: server.url,
      allowInsecureHttp: true,
    });
    await localAI.installPreset('m1');
    const before = server.requestCount();
    const updated = await localAI.updatePreset('m1');
    expect(updated.presetId).toBe('m1');
    expect(server.requestCount()).toBeGreaterThan(before); // re-downloaded
  });
});
