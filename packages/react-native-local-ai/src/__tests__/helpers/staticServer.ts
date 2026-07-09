import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

export interface StaticServerControls {
  url: string;
  /** Total requests received so far. */
  requestCount(): number;
  /** When true, the server responds 200 with the full body even for Range requests. */
  ignoreRange: boolean;
  /** Number of upcoming requests to reject before serving normally. */
  failNextCount: number;
  /** HTTP status used for the rejected requests (default 503). */
  failStatus: number;
  /** Optional Retry-After (seconds) sent with the failure responses. */
  retryAfterSeconds?: number;
  /** If set, the next request writes this many bytes then drops the socket (once). */
  dropAfterBytes: number | null;
  close(): Promise<void>;
}

/** A configurable static file server with HTTP Range support, for download tests. */
export function startStaticServer(body: Buffer): Promise<StaticServerControls> {
  const state = {
    ignoreRange: false,
    failNextCount: 0,
    failStatus: 503,
    retryAfterSeconds: undefined as number | undefined,
    dropAfterBytes: null as number | null,
    count: 0,
  };

  const server: Server = createServer((req, res) => {
    state.count += 1;

    if (state.failNextCount > 0) {
      state.failNextCount -= 1;
      if (state.retryAfterSeconds !== undefined) {
        res.setHeader('Retry-After', String(state.retryAfterSeconds));
      }
      res.statusCode = state.failStatus;
      res.end('error');
      return;
    }

    const total = body.length;
    const rangeHeader = req.headers['range'];
    let start = 0;
    let honorRange = false;

    if (rangeHeader && !state.ignoreRange) {
      const match = /bytes=(\d+)-/.exec(String(rangeHeader));
      if (match) {
        start = Math.min(Number(match[1]), total);
        honorRange = true;
      }
    }

    res.setHeader('Accept-Ranges', 'bytes');
    const slice = body.subarray(start);
    if (honorRange) {
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${total - 1}/${total}`);
      res.setHeader('Content-Length', String(slice.length));
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Length', String(total));
    }

    const payload = honorRange ? slice : body;
    if (state.dropAfterBytes !== null) {
      const cut = Math.min(state.dropAfterBytes, payload.length);
      state.dropAfterBytes = null; // one-shot
      res.write(payload.subarray(0, cut));
      // Simulate a mid-stream connection drop.
      res.socket?.destroy();
      return;
    }

    res.end(payload);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/model.gguf`,
        requestCount: () => state.count,
        get ignoreRange() {
          return state.ignoreRange;
        },
        set ignoreRange(v: boolean) {
          state.ignoreRange = v;
        },
        get failNextCount() {
          return state.failNextCount;
        },
        set failNextCount(v: number) {
          state.failNextCount = v;
        },
        get failStatus() {
          return state.failStatus;
        },
        set failStatus(v: number) {
          state.failStatus = v;
        },
        get retryAfterSeconds() {
          return state.retryAfterSeconds;
        },
        set retryAfterSeconds(v: number | undefined) {
          state.retryAfterSeconds = v;
        },
        get dropAfterBytes() {
          return state.dropAfterBytes;
        },
        set dropAfterBytes(v: number | null) {
          state.dropAfterBytes = v;
        },
        close: () =>
          new Promise<void>((res2, rej) =>
            server.close((err) => (err ? rej(err) : res2()))
          ),
      });
    });
  });
}
