/**
 * BackendRuntime — the public {@link Runtime} wrapper around a {@link RuntimeBackendContext}.
 *
 * Backend-agnostic policy layer:
 *  - **single-flight busy-guard**: only one `generate` at a time (concurrent calls throw).
 *  - **cancellation tracking**: `cancel()` forwards to the backend AND marks the in-flight
 *    result as cancelled, since a blocking native decode may still return truncated text.
 *  - **unload idempotency**: after `unload()` the runtime rejects further use.
 *
 * The backend context owns the engine specifics (llama.cpp, etc.) and accurate timing stats.
 */

import { GenerationBusyError, LocalAIError } from '../errors';
import type { GenerationConfig } from '../types/presets';
import type {
  GenerateOptions,
  GenerationHandle,
  Runtime,
  RuntimeBackendContext,
} from '../types/runtime';
import { BackendGenerationHandle } from './GenerationHandle';
import { mergeGenerationConfig } from './mergeConfig';

export class BackendRuntime implements Runtime {
  private busy = false;
  private cancelledInFlight = false;
  private released = false;

  constructor(
    readonly presetId: string,
    private readonly context: RuntimeBackendContext,
    private readonly defaultConfig?: GenerationConfig
  ) {}

  generate(options: GenerateOptions): GenerationHandle {
    // Error cases surface as a rejected handle (not a synchronous throw) so callers can uniformly
    // `await` / `for await` / `.catch` the return value. The busy check stays synchronous so two
    // rapid calls can't both start.
    if (this.released) {
      return new BackendGenerationHandle(
        () => Promise.reject(new LocalAIError('LOCALAI.RUNTIME_UNAVAILABLE', 'Runtime has been unloaded.')),
        () => undefined
      );
    }
    if (this.busy) {
      return new BackendGenerationHandle(() => Promise.reject(new GenerationBusyError()), () => undefined);
    }
    this.busy = true;
    this.cancelledInFlight = false;
    const config = mergeGenerationConfig(this.defaultConfig, options.config);
    return new BackendGenerationHandle(
      (push) =>
        this.context
          .generate({
            ...options,
            config,
            onToken: (token) => {
              options.onToken?.(token);
              push(token);
            },
          })
          .then((result) =>
            this.cancelledInFlight
              ? {
                  text: result.text,
                  stats: { ...result.stats, cancelled: true, finishReason: 'cancelled' as const },
                }
              : result
          )
          .finally(() => {
            this.busy = false;
          }),
      () => this.cancel()
    );
  }

  cancel(): void {
    if (this.busy && !this.released) {
      this.cancelledInFlight = true;
      this.context.cancel();
    }
  }

  async unload(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.context.unload();
  }
}
