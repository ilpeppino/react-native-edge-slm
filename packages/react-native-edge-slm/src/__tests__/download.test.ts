import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DownloadManager } from '../download/DownloadManager';
import { ChecksumMismatchError, CancelledError, LocalAIError } from '../errors';
import { InMemoryKeyValueStore } from '../storage/KeyValueStore';
import { resolveInstalledPath, resolveTempPath } from '../storage/paths';
import type { UrlModelSource } from '../types/sources';
import { NodeDownloadTransport } from './helpers/NodeDownloadTransport';
import { NodeFileStore } from './helpers/NodeFileStore';
import { startStaticServer, type StaticServerControls } from './helpers/staticServer';

const BODY = Buffer.from('the quick brown fox '.repeat(4096)); // ~80 KB
const BODY_SHA = createHash('sha256').update(BODY).digest('hex');

let root: string;
let fileStore: NodeFileStore;
let server: StaticServerControls;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'localai-'));
  fileStore = new NodeFileStore(root);
  server = await startStaticServer(BODY);
});

afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

function makeManager(): DownloadManager {
  return new DownloadManager({
    fileStore,
    transport: new NodeDownloadTransport(),
    sessions: new InMemoryKeyValueStore(),
    backoffMs: [1, 1, 1],
    progressThrottleMs: 0,
    sleep: async () => undefined, // no real waiting between retries
  });
}

function urlSource(extra: Partial<UrlModelSource> = {}): UrlModelSource {
  return { type: 'url', url: server.url, allowInsecureHttp: true, ...extra };
}

async function installedContent(installed: { path: string }): Promise<Buffer> {
  return readFile(installed.path);
}

describe('DownloadManager', () => {
  it('downloads and atomically installs a model', async () => {
    const installed = await makeManager().download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource(),
    });

    expect(installed.sizeBytes).toBe(BODY.length);
    expect(installed.path).toBe(resolveInstalledPath(await fileStore.paths(), 'model.gguf'));
    expect((await installedContent(installed)).equals(BODY)).toBe(true);
    // temp file cleaned up
    await expect(stat(resolveTempPath(await fileStore.paths(), 'm1'))).rejects.toBeDefined();
  });

  it('verifies a correct SHA-256 and records it', async () => {
    const installed = await makeManager().download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource({ sha256: BODY_SHA }),
    });
    expect(installed.sha256).toBe(BODY_SHA);
  });

  it('rejects a checksum mismatch and deletes the partial file', async () => {
    const badSha = 'f'.repeat(64);
    const manager = makeManager();
    await expect(
      manager.download({ presetId: 'm1', fileName: 'model.gguf', source: urlSource({ sha256: badSha }) })
    ).rejects.toBeInstanceOf(ChecksumMismatchError);

    const paths = await fileStore.paths();
    expect(await fileStore.exists(resolveTempPath(paths, 'm1'))).toBe(false);
    expect(await fileStore.exists(resolveInstalledPath(paths, 'model.gguf'))).toBe(false);
  });

  it('resumes after a mid-stream connection drop', async () => {
    server.dropAfterBytes = 20_000; // drop the first attempt partway through
    const installed = await makeManager().download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource({ sha256: BODY_SHA }),
    });

    expect((await installedContent(installed)).equals(BODY)).toBe(true);
    expect(server.requestCount()).toBeGreaterThanOrEqual(2); // initial + resume
  });

  it('restarts cleanly when the server ignores Range on resume', async () => {
    server.dropAfterBytes = 20_000; // create a partial temp file
    server.failNextCount = 0;
    const manager = makeManager();

    // After the drop, force the server to ignore Range so the resume gets a 200.
    const originalDownload = NodeDownloadTransport.prototype.downloadToFile;
    let firstDone = false;
    jest
      .spyOn(NodeDownloadTransport.prototype, 'downloadToFile')
      .mockImplementation(async function (this: NodeDownloadTransport, req) {
        if (firstDone) server.ignoreRange = true;
        firstDone = true;
        return originalDownload.call(this, req);
      });

    const installed = await manager.download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource({ sha256: BODY_SHA }),
    });
    expect((await installedContent(installed)).equals(BODY)).toBe(true);
  });

  it('retries transient 503 responses honoring Retry-After', async () => {
    server.failNextCount = 2;
    server.failStatus = 503;
    server.retryAfterSeconds = 0;

    const installed = await makeManager().download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource({ sha256: BODY_SHA }),
    });
    expect(installed.sizeBytes).toBe(BODY.length);
    expect(server.requestCount()).toBe(3); // 2 failures + 1 success
  });

  it('fails fast on a non-retryable 4xx', async () => {
    server.failNextCount = 1;
    server.failStatus = 403;
    const manager = makeManager();
    await expect(
      manager.download({ presetId: 'm1', fileName: 'model.gguf', source: urlSource() })
    ).rejects.toMatchObject({ code: 'LOCALAI.DOWNLOAD_FAILED' });
    expect(server.requestCount()).toBe(1); // no retry
  });

  it('pre-checks free storage against expectedSizeBytes', async () => {
    fileStore.freeBytes = 1000; // far less than the model
    const manager = makeManager();
    await expect(
      manager.download({
        presetId: 'm1',
        fileName: 'model.gguf',
        source: urlSource(),
        expectedSizeBytes: BODY.length,
      })
    ).rejects.toMatchObject({ code: 'LOCALAI.INSUFFICIENT_STORAGE' });
    expect(server.requestCount()).toBe(0);
  });

  it('cancels via a pre-aborted signal without hitting the network', async () => {
    const controller = new AbortController();
    controller.abort();
    const manager = makeManager();
    await expect(
      manager.download({
        presetId: 'm1',
        fileName: 'model.gguf',
        source: urlSource(),
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(CancelledError);
    expect(server.requestCount()).toBe(0);
  });

  it('rejects a non-HTTPS URL without opt-in (InsecureUrlError)', async () => {
    const manager = makeManager();
    await expect(
      manager.download({
        presetId: 'm1',
        fileName: 'model.gguf',
        source: { type: 'url', url: server.url }, // no allowInsecureHttp
      })
    ).rejects.toMatchObject({ code: 'LOCALAI.INSECURE_URL' });
    expect(server.requestCount()).toBe(0);
  });

  it('reports throttled progress that reaches 100%', async () => {
    const events: number[] = [];
    await makeManager().download({
      presetId: 'm1',
      fileName: 'model.gguf',
      source: urlSource(),
      onProgress: (p) => {
        if (p.progress !== undefined) events.push(p.progress);
      },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toBeCloseTo(1, 5);
  });
});

it('LocalAIError carries a stable code', () => {
  const err = new LocalAIError('LOCALAI.NETWORK', 'x');
  expect(err.code).toBe('LOCALAI.NETWORK');
  expect(err).toBeInstanceOf(Error);
});
