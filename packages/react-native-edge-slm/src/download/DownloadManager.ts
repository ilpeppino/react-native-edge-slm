/**
 * DownloadManager — orchestrates the model install lifecycle.
 *
 *   not-installed → downloading → verifying → installed
 *                        │            │
 *                        └── failed ──┘
 *
 * Pure orchestration over injected {@link FileStore} and {@link DownloadTransport}: resume from
 * the partial temp file, retry transient failures with backoff, verify SHA-256 (when provided),
 * then atomically rename temp→installed. No platform or network code lives here, so the same
 * class runs on-device and under Jest against a local static server.
 */

import {
  CancelledError,
  ChecksumMismatchError,
  InsecureUrlError,
  LocalAIError,
} from '../errors';
import type { InstalledModel, DownloadProgress } from '../types/status';
import type { RemoteModelSource, Sha256Hex } from '../types/sources';
import type { FileStore } from '../storage/FileStore';
import type { KeyValueStore } from '../storage/KeyValueStore';
import { resolveInstalledPath, resolveTempPath } from '../storage/paths';
import {
  DownloadHttpError,
  RangeNotSupportedError,
  RetryableDownloadError,
  type DownloadTransport,
} from './DownloadTransport';
import { resolveRemoteSource } from './resolveSourceUrl';

const SESSIONS_KEY = 'localai.download.sessions.v1';

export interface DownloadManagerOptions {
  fileStore: FileStore;
  transport: DownloadTransport;
  /** Persists resume sessions across app restarts. In-memory is fine if persistence isn't needed. */
  sessions: KeyValueStore;
  /** Max attempts for the whole resumable download (each attempt resumes from the temp offset). */
  maxAttempts?: number;
  /** Backoff schedule (ms) indexed by attempt; the last value is reused for further attempts. */
  backoffMs?: number[];
  /** Multiplier applied to `expectedSizeBytes` for the free-storage pre-check headroom. */
  storageHeadroom?: number;
  /** Minimum ms between forwarded progress events. */
  progressThrottleMs?: number;
  /** Injected clock (ms). */
  now?: () => number;
  /** Injected sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface DownloadRequest {
  presetId: string;
  fileName: string;
  source: RemoteModelSource;
  expectedSizeBytes?: number;
  onProgress?: (progress: DownloadProgress) => void;
  /** Called once the bytes are on disk and verification begins. */
  onVerifying?: () => void;
  signal?: AbortSignal;
}

interface DownloadSession {
  presetId: string;
  fileName: string;
  receivedBytes: number;
  updatedAt: number;
}

const DEFAULT_BACKOFF = [500, 1500, 4000];

export class DownloadManager {
  private readonly fileStore: FileStore;
  private readonly transport: DownloadTransport;
  private readonly sessions: KeyValueStore;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly storageHeadroom: number;
  private readonly progressThrottleMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: DownloadManagerOptions) {
    this.fileStore = options.fileStore;
    this.transport = options.transport;
    this.sessions = options.sessions;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF;
    this.storageHeadroom = options.storageHeadroom ?? 1.1;
    this.progressThrottleMs = options.progressThrottleMs ?? 200;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Download → verify → install. Returns the installed model record. */
  async download(request: DownloadRequest): Promise<InstalledModel> {
    const { presetId, fileName, source } = request;
    const resolved = resolveRemoteSource(source); // throws InsecureUrlError if disallowed

    const paths = await this.fileStore.paths();
    await this.fileStore.ensureDir(paths.tempDir);
    await this.fileStore.ensureDir(paths.installedDir);

    const tempPath = resolveTempPath(paths, presetId);
    const installedPath = resolveInstalledPath(paths, fileName);

    await this.assertEnoughStorage(request.expectedSizeBytes, tempPath);
    this.throwIfAborted(request.signal);

    const emitProgress = this.makeProgressEmitter(presetId, request.onProgress);

    // ---- resumable download loop ----
    let attempt = 0;
    let completed = false;
    while (!completed) {
      this.throwIfAborted(request.signal);
      const fromByte = await this.fileStore.size(tempPath);

      try {
        const result = await this.transport.downloadToFile({
          url: resolved.url,
          destPath: tempPath,
          fromByte,
          headers: resolved.headers,
          signal: request.signal,
          onProgress: (received, total) => emitProgress(received, total),
        });
        await this.persistSession(tempPath, presetId, fileName, result.receivedBytes);
        completed = true;
      } catch (error) {
        if (this.isAbort(error, request.signal)) {
          throw new CancelledError();
        }
        if (error instanceof RangeNotSupportedError) {
          // Restart cleanly from offset 0 once, then let normal retry accounting apply.
          await this.fileStore.delete(tempPath);
        } else if (!(error instanceof RetryableDownloadError)) {
          // Non-retryable (e.g. 4xx). Clean up the partial and surface it.
          await this.cleanupFailure(tempPath, presetId);
          throw error instanceof LocalAIError
            ? error
            : new DownloadHttpError(0);
        }

        attempt += 1;
        if (attempt >= this.maxAttempts) {
          await this.cleanupFailure(tempPath, presetId);
          throw error instanceof LocalAIError
            ? error
            : new RetryableDownloadError('Download failed after retries', { cause: error });
        }
        const wait =
          (error instanceof RetryableDownloadError && error.retryAfterMs) ||
          this.backoffFor(attempt);
        await this.sleep(wait);
      }
    }

    // ---- verify ----
    this.throwIfAborted(request.signal);
    request.onVerifying?.();
    const verifiedSha = await this.verify(tempPath, resolved.sha256, presetId);

    // ---- atomic install ----
    await this.fileStore.move(tempPath, installedPath);
    const sizeBytes = await this.fileStore.size(installedPath);
    await this.clearSession(presetId);

    return {
      presetId,
      path: installedPath,
      fileName,
      sizeBytes,
      sha256: verifiedSha,
      installedAt: this.now(),
    };
  }

  /** Delete any partial temp file and clear the session for a preset. */
  async cancelAndCleanup(presetId: string): Promise<void> {
    const paths = await this.fileStore.paths();
    await this.fileStore.delete(resolveTempPath(paths, presetId));
    await this.clearSession(presetId);
  }

  // ---- internals ----

  private async verify(
    tempPath: string,
    expected: Sha256Hex | undefined,
    presetId: string
  ): Promise<Sha256Hex | undefined> {
    if (!expected) return undefined;
    const actual = await this.fileStore.sha256(tempPath);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      await this.cleanupFailure(tempPath, presetId);
      throw new ChecksumMismatchError(expected.toLowerCase(), actual.toLowerCase());
    }
    return actual.toLowerCase();
  }

  private async assertEnoughStorage(
    expectedSizeBytes: number | undefined,
    tempPath: string
  ): Promise<void> {
    if (!expectedSizeBytes) return;
    const alreadyOnDisk = await this.fileStore.size(tempPath);
    const remaining = Math.max(0, expectedSizeBytes - alreadyOnDisk);
    const free = await this.fileStore.freeStorageBytes();
    if (free < remaining * this.storageHeadroom) {
      throw new LocalAIError(
        'LOCALAI.INSUFFICIENT_STORAGE',
        'Not enough free storage to download this model.',
        { details: { requiredBytes: Math.ceil(remaining * this.storageHeadroom), freeBytes: free } }
      );
    }
  }

  private makeProgressEmitter(
    presetId: string,
    onProgress?: (p: DownloadProgress) => void
  ): (received: number, total?: number) => void {
    if (!onProgress) return () => {};
    let lastAt = 0;
    let lastBytes = 0;
    return (receivedBytes, totalBytes) => {
      const at = this.now();
      const isFinal = totalBytes !== undefined && receivedBytes >= totalBytes;
      if (!isFinal && at - lastAt < this.progressThrottleMs) return;
      const elapsed = at - lastAt;
      const bytesPerSecond =
        elapsed > 0 ? Math.round(((receivedBytes - lastBytes) * 1000) / elapsed) : undefined;
      lastAt = at;
      lastBytes = receivedBytes;
      onProgress({
        presetId,
        receivedBytes,
        totalBytes,
        progress:
          totalBytes && totalBytes > 0
            ? Math.min(1, receivedBytes / totalBytes)
            : undefined,
        bytesPerSecond,
      });
    };
  }

  private backoffFor(attempt: number): number {
    const idx = Math.min(attempt - 1, this.backoffMs.length - 1);
    return this.backoffMs[Math.max(0, idx)]!;
  }

  private async cleanupFailure(tempPath: string, presetId: string): Promise<void> {
    await this.fileStore.delete(tempPath);
    await this.clearSession(presetId);
  }

  private async readSessions(): Promise<Record<string, DownloadSession>> {
    const raw = await this.sessions.getItem(SESSIONS_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async persistSession(
    tempPath: string,
    presetId: string,
    fileName: string,
    receivedBytes: number
  ): Promise<void> {
    void tempPath;
    const sessions = await this.readSessions();
    sessions[presetId] = { presetId, fileName, receivedBytes, updatedAt: this.now() };
    await this.sessions.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }

  private async clearSession(presetId: string): Promise<void> {
    const sessions = await this.readSessions();
    if (sessions[presetId]) {
      delete sessions[presetId];
      await this.sessions.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new CancelledError();
  }

  private isAbort(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error instanceof CancelledError)
    );
  }
}

// Re-export so callers can catch install-time policy errors from one module.
export { InsecureUrlError };
