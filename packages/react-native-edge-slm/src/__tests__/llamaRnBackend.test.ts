/**
 * Regression tests for {@link LlamaRnBackend} — specifically the cancel() path, which has to
 * absorb llama.rn's platform-inconsistent `stopCompletion()` return type.
 *
 * `LlamaContext.stopCompletion()` is typed `Promise<void>`, but the native implementation returns
 * `undefined` synchronously on the JSI/new-arch path (iOS) and a real Promise on the bridge path.
 * The adapter must normalize both so `runtime.cancel()` never crashes the app.
 */
import type { LlamaContext, TokenData } from 'llama.rn';

// Controlled fake `LlamaContext`. Each test swaps in a different `stopCompletion` to mimic a
// platform. `initLlama` is mocked to return whatever the current test set up.
let fakeContext: Partial<LlamaContext>;

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => fakeContext),
}));

import { LlamaRnBackend } from '../runtime/backends/LlamaRnBackend';

function makeContext(stopCompletion: () => unknown): Partial<LlamaContext> {
  return {
    completion: (async (
      _params: unknown,
      onToken?: (data: TokenData) => void
    ) => {
      onToken?.({ token: 'hi' } as TokenData);
      return { text: 'hi', timings: {} };
    }) as unknown as LlamaContext['completion'],
    stopCompletion: stopCompletion as unknown as LlamaContext['stopCompletion'],
    release: (async () => undefined) as LlamaContext['release'],
  };
}

async function loadContext(stopCompletion: () => unknown) {
  fakeContext = makeContext(stopCompletion);
  const backend = new LlamaRnBackend();
  return backend.load({ modelPath: '/model.gguf' });
}

describe('LlamaRnBackend.cancel — platform-inconsistent stopCompletion', () => {
  it('does not throw when stopCompletion returns void (iOS / JSI path)', async () => {
    const ctx = await loadContext(() => undefined);
    // Pre-fix this threw: `undefined.catch is not a function`.
    expect(() => ctx.cancel()).not.toThrow();
  });

  it('does not surface a rejection when stopCompletion returns a rejecting Promise (bridge path)', async () => {
    const ctx = await loadContext(() => Promise.reject(new Error('interrupt failed')));
    expect(() => ctx.cancel()).not.toThrow();
    // Flush microtasks: the swallowed rejection must not become an unhandledRejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('swallows a synchronous throw from stopCompletion (context already released)', async () => {
    const ctx = await loadContext(() => {
      throw new Error('no active completion');
    });
    expect(() => ctx.cancel()).not.toThrow();
  });

  it('remains safe to call cancel() repeatedly (rapid repeated cancel)', async () => {
    const ctx = await loadContext(() => undefined);
    expect(() => {
      ctx.cancel();
      ctx.cancel();
      ctx.cancel();
    }).not.toThrow();
  });
});
