/**
 * LlamaRnBackend — the built-in llama.cpp {@link RuntimeBackend} over `llama.rn`.
 *
 * `llama.rn` is an optional peer dependency and native-only; this module is imported lazily by
 * the facade (never at package top level), so apps that register their own backend — or Node
 * tests — never load it.
 *
 * The generic cancellation policy (busy-guard, cancel-marks-result) lives in `BackendRuntime`;
 * here `cancel()` maps to `stopCompletion()`, the real interrupt for llama.cpp's blocking decode.
 */

import { initLlama, type LlamaContext, type TokenData } from 'llama.rn';

import { LocalAIError } from '../../errors';
import type {
  GenerateOptions,
  GenerateResult,
  LoadOptions,
  RuntimeBackend,
  RuntimeBackendCapabilities,
  RuntimeBackendContext,
} from '../../types/runtime';

const RUNTIME_KEY = 'llama.cpp';
const DEFAULT_N_CTX = 2048;

export class LlamaRnBackend implements RuntimeBackend {
  readonly key = RUNTIME_KEY;

  capabilities(): RuntimeBackendCapabilities {
    return { runtime: RUNTIME_KEY, streaming: true, vision: false, cancellable: true };
  }

  async isAvailable(): Promise<boolean> {
    return typeof initLlama === 'function';
  }

  async load(options: LoadOptions): Promise<RuntimeBackendContext> {
    const { config } = options;
    try {
      const context = await initLlama({
        model: options.modelPath,
        n_ctx: config?.nCtx ?? DEFAULT_N_CTX,
        ...(config?.nGpuLayers !== undefined ? { n_gpu_layers: config.nGpuLayers } : {}),
        ...(config?.nThreads !== undefined ? { n_threads: config.nThreads } : {}),
      });
      return new LlamaRnContext(context);
    } catch (error) {
      throw new LocalAIError('LOCALAI.LOAD_FAILED', 'Failed to load model into llama.cpp.', {
        cause: error,
      });
    }
  }
}

class LlamaRnContext implements RuntimeBackendContext {
  constructor(private readonly context: LlamaContext) {}

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const config = options.config ?? {};
    const startedAt = Date.now();
    let firstTokenAt: number | undefined;
    let tokenCount = 0;

    try {
      const result = await this.context.completion(
        {
          prompt: options.prompt,
          ...(config.maxTokens !== undefined ? { n_predict: config.maxTokens } : {}),
          ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
          ...(config.topK !== undefined ? { top_k: config.topK } : {}),
          ...(config.topP !== undefined ? { top_p: config.topP } : {}),
          ...(config.stop !== undefined ? { stop: config.stop } : {}),
          ...(config.seed !== undefined ? { seed: config.seed } : {}),
        },
        (data: TokenData) => {
          if (!data.token) return;
          if (firstTokenAt === undefined) firstTokenAt = Date.now();
          tokenCount += 1;
          options.onToken?.(data.token);
        }
      );

      const totalMs = Date.now() - startedAt;
      const tokensGenerated = result.timings?.predicted_n ?? tokenCount;
      return {
        text: result.text ?? '',
        stats: {
          tokensGenerated,
          firstTokenMs: firstTokenAt !== undefined ? firstTokenAt - startedAt : undefined,
          totalMs,
          tokensPerSecond:
            result.timings?.predicted_per_second ??
            (totalMs > 0 ? (tokensGenerated * 1000) / totalMs : undefined),
          cancelled: false,
          finishReason: 'stop',
        },
      };
    } catch (error) {
      throw new LocalAIError('LOCALAI.GENERATION_FAILED', 'llama.cpp generation failed.', {
        cause: error,
      });
    }
  }

  cancel(): void {
    // Fire-and-forget: stopCompletion resolves the in-flight completion() promise.
    void this.context.stopCompletion().catch(() => undefined);
  }

  async unload(): Promise<void> {
    await this.context.release();
  }
}
