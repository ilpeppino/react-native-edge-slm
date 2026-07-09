import { BackendRuntime } from '../runtime/BackendRuntime';
import { mergeGenerationConfig } from '../runtime/mergeConfig';
import { GenerationBusyError } from '../errors';
import { FakeContext } from './helpers/FakeBackend';

describe('mergeGenerationConfig', () => {
  it('lets later values win and ignores undefined', () => {
    expect(
      mergeGenerationConfig({ temperature: 0.2, topK: 40 }, { temperature: 0.9, topP: undefined })
    ).toEqual({ temperature: 0.9, topK: 40 });
  });

  it('replaces arrays wholesale', () => {
    expect(mergeGenerationConfig({ stop: ['a'] }, { stop: ['b', 'c'] })).toEqual({
      stop: ['b', 'c'],
    });
  });
});

describe('BackendRuntime', () => {
  it('streams tokens and returns aggregated text + stats', async () => {
    const ctx = new FakeContext(['a', 'b', 'c'], 1);
    const runtime = new BackendRuntime('m1', ctx);
    const streamed: string[] = [];
    const result = await runtime.generate({ prompt: 'hi', onToken: (t) => streamed.push(t) });

    expect(streamed).toEqual(['a', 'b', 'c']);
    expect(result.text).toBe('abc');
    expect(result.stats.tokensGenerated).toBe(3);
    expect(result.stats.firstTokenMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.cancelled).toBe(false);
  });

  it('merges default and per-call config before handing it to the backend', async () => {
    const ctx = new FakeContext(['x'], 1);
    const runtime = new BackendRuntime('m1', ctx, { temperature: 0.1, maxTokens: 10 });
    await runtime.generate({ prompt: 'hi', config: { temperature: 0.7 } });
    expect(ctx.lastConfig).toEqual({ temperature: 0.7, maxTokens: 10 });
  });

  it('enforces single-flight with a busy-guard', async () => {
    const ctx = new FakeContext(['a', 'b', 'c', 'd'], 5);
    const runtime = new BackendRuntime('m1', ctx);
    const first = runtime.generate({ prompt: 'hi' });
    await expect(runtime.generate({ prompt: 'again' })).rejects.toBeInstanceOf(GenerationBusyError);
    await first; // let the first finish
  });

  it('cancels an in-flight generation and marks the result', async () => {
    const ctx = new FakeContext(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 8);
    const runtime = new BackendRuntime('m1', ctx);
    const streamed: string[] = [];
    const pending = runtime.generate({ prompt: 'hi', onToken: (t) => streamed.push(t) });
    await new Promise((r) => setTimeout(r, 20));
    runtime.cancel();
    const result = await pending;

    expect(result.stats.cancelled).toBe(true);
    expect(result.stats.finishReason).toBe('cancelled');
    expect(streamed.length).toBeLessThan(8); // stopped early
  });

  it('rejects use after unload and is idempotent', async () => {
    const ctx = new FakeContext(['a'], 1);
    const runtime = new BackendRuntime('m1', ctx);
    await runtime.unload();
    await runtime.unload(); // idempotent, no throw
    expect(ctx.unloadCount).toBe(1);
    await expect(runtime.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'LOCALAI.RUNTIME_UNAVAILABLE',
    });
  });
});
