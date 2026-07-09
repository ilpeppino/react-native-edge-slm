/**
 * BackendGenerationHandle — the concrete {@link GenerationHandle} returned by
 * {@link BackendRuntime.generate}.
 *
 * It bridges the backend's push-based streaming (`onToken`) into a pull-based async iterator,
 * while also exposing the whole generation as a promise. A `producer` runs the underlying
 * generation and pushes each token; the same run is observable two ways:
 *
 *  - `await handle` (or `.then/.catch/.finally`) → the aggregated {@link GenerateResult};
 *  - `for await (const { text } of handle)` → each {@link TokenChunk} as it arrives.
 *
 * If a consumer stops iterating early (`break`/`return`/`throw`) before the generation settles,
 * the handle cancels it. Error cases (busy runtime, unloaded runtime) are represented by a
 * producer that rejects immediately, so they surface as a rejected `await` / a throwing iterator
 * rather than a synchronous throw at the call site.
 */
import type { GenerateResult, GenerationHandle, TokenChunk } from '../types/runtime';

/** Runs the generation, calling `push` for each token; resolves with the final result. */
export type GenerationProducer = (push: (token: string) => void) => Promise<GenerateResult>;

export class BackendGenerationHandle implements GenerationHandle {
  private readonly queue: string[] = [];
  private wakers: Array<() => void> = [];
  private settled = false;
  private failed = false;
  private failure: unknown;
  private readonly promise: Promise<GenerateResult>;

  constructor(producer: GenerationProducer, private readonly onCancel: () => void) {
    this.promise = (async () => {
      try {
        return await producer((token) => this.push(token));
      } catch (error) {
        this.failed = true;
        this.failure = error;
        throw error;
      } finally {
        this.settled = true;
        this.wake();
      }
    })();
    // Prevent an unhandledRejection when the consumer only iterates (or ignores errors);
    // real consumers still see the rejection via then/catch/for-await.
    this.promise.catch(() => undefined);
  }

  then<TResult1 = GenerateResult, TResult2 = never>(
    onfulfilled?: ((value: GenerateResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<GenerateResult | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<GenerateResult> {
    return this.promise.finally(onfinally);
  }

  cancel(): void {
    this.onCancel();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TokenChunk> {
    try {
      for (;;) {
        while (this.queue.length > 0) {
          yield { text: this.queue.shift() as string };
        }
        if (this.settled) {
          if (this.failed) throw this.failure;
          return;
        }
        await this.nextWake();
      }
    } finally {
      // Consumer stopped early (break/return/throw) before the generation settled → cancel it.
      if (!this.settled) {
        this.onCancel();
        await this.promise.catch(() => undefined);
      }
    }
  }

  private push(token: string): void {
    this.queue.push(token);
    this.wake();
  }

  private wake(): void {
    const wakers = this.wakers;
    this.wakers = [];
    for (const resolve of wakers) resolve();
  }

  private nextWake(): Promise<void> {
    return new Promise<void>((resolve) => this.wakers.push(resolve));
  }
}
