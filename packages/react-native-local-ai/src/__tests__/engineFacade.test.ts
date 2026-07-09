import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalAIFacade } from '../LocalAI';
import type { LocalAIEnvironment } from '../environment';
import { ModelNotInstalledError } from '../errors';
import { InMemoryKeyValueStore } from '../storage/KeyValueStore';
import type { DeviceCapabilities } from '../types/status';
import { FakeBackend } from './helpers/FakeBackend';
import { NodeDownloadTransport } from './helpers/NodeDownloadTransport';
import { NodeFileStore } from './helpers/NodeFileStore';

const CAPS: DeviceCapabilities = { platform: 'android', totalRamBytes: 12 * 1024 ** 3 };

let root: string;
let modelPath: string;
let localAI: LocalAIFacade;
let backend: FakeBackend;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'localai-engine-'));
  modelPath = join(root, 'model.gguf');
  await writeFile(modelPath, 'fake-gguf-bytes');

  const env: LocalAIEnvironment = {
    fileStore: new NodeFileStore(root),
    transport: new NodeDownloadTransport(),
    keyValueStore: new InMemoryKeyValueStore(),
    deviceInfo: { getDeviceCapabilities: async () => CAPS },
  };
  localAI = new LocalAIFacade();
  localAI.configure(env);
  backend = new FakeBackend(['On', ' the', ' sea', '.']);
  localAI.registerBackend(backend);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function installLocalModel(runtime = 'llama.cpp'): Promise<void> {
  localAI.registerPreset({
    id: 'm1',
    displayName: 'Local Model',
    runtime,
    fileName: 'model.gguf',
    defaultGenerationConfig: { temperature: 0.3 },
  });
  localAI.configurePresetSource('m1', { type: 'local-file', path: modelPath });
  await localAI.installPreset('m1');
}

describe('LocalAI engine', () => {
  it('loadPreset requires an installed model', async () => {
    localAI.registerPreset({ id: 'm1', displayName: 'M', runtime: 'llama.cpp', fileName: 'm.gguf' });
    await expect(localAI.loadPreset('m1')).rejects.toBeInstanceOf(ModelNotInstalledError);
  });

  it('loads a preset and streams generated tokens', async () => {
    await installLocalModel();
    const runtime = await localAI.loadPreset('m1');
    const streamed: string[] = [];
    const result = await runtime.generate({ prompt: 'Tell me.', onToken: (t) => streamed.push(t) });

    expect(streamed.join('')).toBe('On the sea.');
    expect(result.text).toBe('On the sea.');
    expect(backend.loadCount).toBe(1);
    await runtime.unload();
    expect(backend.lastContext?.unloadCount).toBe(1);
  });

  it('applies the preset default config at load and generate time', async () => {
    await installLocalModel();
    const runtime = await localAI.loadPreset('m1', { maxTokens: 32 });
    await runtime.generate({ prompt: 'hi' });
    // default temperature (0.3) + load-time maxTokens (32) merged into the generate config
    expect(backend.lastContext?.lastConfig).toMatchObject({ temperature: 0.3, maxTokens: 32 });
  });

  it('benchmarks an installed model', async () => {
    await installLocalModel();
    const result = await localAI.benchmark('m1', { maxTokens: 8 });
    expect(result.presetId).toBe('m1');
    expect(result.runtime).toBe('llama.cpp');
    expect(result.tokensGenerated).toBeGreaterThan(0);
    expect(result.tokensPerSecond).toBeGreaterThan(0);
    expect(result.loadMs).toBeGreaterThanOrEqual(0);
    // benchmark loads and unloads its own context
    expect(backend.lastContext?.unloadCount).toBe(1);
  });

  it('throws for a runtime with no registered backend', async () => {
    await installLocalModel('some-private-runtime');
    await expect(localAI.loadPreset('m1')).rejects.toMatchObject({
      code: 'LOCALAI.RUNTIME_UNAVAILABLE',
    });
  });

  it('uses a custom backend registered by key', async () => {
    const custom = new FakeBackend(['C'], 1, 'custom-engine');
    localAI.registerBackend(custom);
    await installLocalModel('custom-engine');
    const runtime = await localAI.loadPreset('m1');
    const result = await runtime.generate({ prompt: 'hi' });
    expect(result.text).toBe('C');
    expect(custom.loadCount).toBe(1);
  });
});
