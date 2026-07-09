/**
 * DownloadTransport — the network boundary.
 *
 * A transport streams a remote URL directly to a destination file, appending from a byte
 * offset (for resume) using HTTP `Range`. Writing to disk happens inside the transport so that
 * on-device implementations never copy multi-GB payloads across the RN bridge.
 *
 * On-device: a native module writing with `RandomAccessFile`. In tests: Node `http`/`fs`.
 */

export interface DownloadToFileRequest {
  url: string;
  /** Absolute destination path (the `.part` temp file). */
  destPath: string;
  /** Resume offset. The transport requests `Range: bytes=<fromByte>-` and appends. */
  fromByte: number;
  headers?: Record<string, string>;
  /** Called with cumulative received bytes (including `fromByte`) and total size when known. */
  onProgress?: (receivedBytes: number, totalBytes?: number) => void;
  /** Aborts the in-flight request. */
  signal?: AbortSignal;
}

export interface DownloadToFileResult {
  /** Total size of the resource in bytes, when the server reported it. */
  totalBytes?: number;
  /** Bytes present in `destPath` after this call. */
  receivedBytes: number;
}

export interface DownloadTransport {
  /**
   * Stream `url` into `destPath` starting at `fromByte`.
   *
   * Contract:
   * - If `fromByte > 0` and the server honors `Range`, respond `206` and append.
   * - If `fromByte > 0` and the server responds `200` (ignores Range), the transport MUST
   *   truncate `destPath` to 0 and write the full body from the start (see
   *   {@link RangeNotSupportedError} for the alternative of surfacing it).
   * - Throw {@link RetryableDownloadError} for transient failures (network reset, 429, 5xx);
   *   the manager resumes from the new offset after a backoff.
   * - Throw a non-retryable {@link DownloadHttpError} for 4xx (except 429).
   */
  downloadToFile(request: DownloadToFileRequest): Promise<DownloadToFileResult>;
}

// ---- Transport error types --------------------------------------------------

import { LocalAIError } from '../errors';

/** A transient failure the manager should retry (after `retryAfterMs`, if provided). */
export class RetryableDownloadError extends LocalAIError {
  readonly retryAfterMs?: number;
  constructor(message: string, options?: { retryAfterMs?: number; cause?: unknown }) {
    super('LOCALAI.NETWORK', message, { cause: options?.cause });
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/** A non-retryable HTTP status (e.g. 403/404). */
export class DownloadHttpError extends LocalAIError {
  readonly status: number;
  constructor(status: number, url?: string) {
    super('LOCALAI.DOWNLOAD_FAILED', `Download failed with HTTP ${status}.`, {
      details: { status },
    });
    this.status = status;
  }
}

/** The server ignored a `Range` request at a non-zero offset and restart was not possible. */
export class RangeNotSupportedError extends LocalAIError {
  constructor() {
    super(
      'LOCALAI.RANGE_NOT_SUPPORTED',
      'Server ignored the Range header while resuming; cannot safely continue.'
    );
  }
}
