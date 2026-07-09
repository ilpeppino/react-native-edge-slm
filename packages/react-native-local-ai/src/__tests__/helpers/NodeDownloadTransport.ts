import { open } from 'node:fs/promises';

import {
  DownloadHttpError,
  RetryableDownloadError,
  type DownloadToFileRequest,
  type DownloadToFileResult,
  type DownloadTransport,
} from '../../download/DownloadTransport';

/**
 * Node `fetch`/`fs`-backed transport for tests. Implements the same contract the on-device
 * native `downloadToFile` must honor: Range resume, restart-on-200, retryable vs. fatal errors.
 */
export class NodeDownloadTransport implements DownloadTransport {
  async downloadToFile(request: DownloadToFileRequest): Promise<DownloadToFileResult> {
    const headers: Record<string, string> = { ...request.headers };
    if (request.fromByte > 0) headers['Range'] = `bytes=${request.fromByte}-`;

    let response: Response;
    try {
      response = await fetch(request.url, { headers, signal: request.signal });
    } catch (error) {
      if (isAbort(error, request.signal)) throw error;
      throw new RetryableDownloadError('Network request failed', { cause: error });
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = response.headers.get('retry-after');
      throw new RetryableDownloadError(`HTTP ${response.status}`, {
        retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined,
      });
    }
    if (response.status >= 400) {
      throw new DownloadHttpError(response.status);
    }

    // Range honored → append; server ignored Range at an offset → restart from 0.
    const serverIgnoredRange = request.fromByte > 0 && response.status === 200;
    const flag = serverIgnoredRange ? 'w' : 'a';
    let received = serverIgnoredRange ? 0 : request.fromByte;

    const total = resolveTotal(response, request.fromByte, serverIgnoredRange);
    if (!response.body) {
      throw new RetryableDownloadError('Empty response body');
    }

    const handle = await open(request.destPath, flag);
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        await handle.write(chunk);
        received += chunk.length;
        request.onProgress?.(received, total);
      }
    } catch (error) {
      if (isAbort(error, request.signal)) throw error;
      // Mid-stream drop → retryable; the manager resumes from the current temp size.
      throw new RetryableDownloadError('Connection dropped mid-stream', { cause: error });
    } finally {
      await handle.close();
    }

    return { totalBytes: total, receivedBytes: received };
  }
}

function resolveTotal(
  response: Response,
  fromByte: number,
  serverIgnoredRange: boolean
): number | undefined {
  const contentRange = response.headers.get('content-range');
  if (contentRange) {
    const match = /\/(\d+)\s*$/.exec(contentRange);
    if (match) return Number(match[1]);
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const len = Number(contentLength);
    return serverIgnoredRange || fromByte === 0 ? len : fromByte + len;
  }
  return undefined;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError');
}
