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
  GenerateResult,
  Runtime,
  RuntimeBackendContext,
} from '../types/runtime';
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

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (this.released) {
      throw new LocalAIError('LOCALAI.RUNTIME_UNAVAILABLE', 'Runtime has been unloaded.');
    }
    if (this.busy) {
      throw new GenerationBusyError();
    }
    this.busy = true;
    this.cancelledInFlight = false;
    try {
      const config = mergeGenerationConfig(this.defaultConfig, options.config);
      const result = await this.context.generate({ ...options, config });
      if (this.cancelledInFlight) {
        return {
          text: result.text,
          stats: { ...result.stats, cancelled: true, finishReason: 'cancelled' },
        };
      }
      return result;
    } finally {
      this.busy = false;
    }
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
