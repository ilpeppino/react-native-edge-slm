/**
 * NativeLlamaCppBackend — scaffold for a **self-hosted** llama.cpp backend.
 *
 * The default `llama.cpp` runtime is served by {@link LlamaRnBackend} (via the `llama.rn`
 * dependency). This backend is the alternative that vendors llama.cpp directly and talks to an
 * in-repo native module (`cpp/` + a thin JNI/JSI bridge), trading more build/maintenance work
 * for full control over the engine.
 *
 * It is **not implemented yet** — this class defines the exact boundary and registration story
 * so the native work in `cpp/` has a fixed TypeScript contract to satisfy. See
 * `docs/cpp-backend.md` for the design and build plan.
 *
 * Usage once implemented:
 * ```ts
 * import { NativeLlamaCppBackend } from 'react-native-local-ai';
 * LocalAI.registerBackend(new NativeLlamaCppBackend());
 * // then register presets with `runtime: 'llama.cpp-native'`
 * ```
 */

import { NotImplementedError } from '../../errors';
import type {
  LoadOptions,
  RuntimeBackend,
  RuntimeBackendCapabilities,
  RuntimeBackendContext,
} from '../../types/runtime';

/** Runtime key for the self-hosted backend (distinct from the default `llama.cpp`). */
export const NATIVE_LLAMA_CPP_RUNTIME = 'llama.cpp-native';

export class NativeLlamaCppBackend implements RuntimeBackend {
  readonly key = NATIVE_LLAMA_CPP_RUNTIME;

  capabilities(): RuntimeBackendCapabilities {
    return { runtime: this.key, streaming: true, vision: false, cancellable: true };
  }

  /** False until the in-repo native module (`cpp/`) is built and linked. */
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async load(_options: LoadOptions): Promise<RuntimeBackendContext> {
    throw new NotImplementedError(
      'NativeLlamaCppBackend (self-hosted llama.cpp) — see docs/cpp-backend.md'
    );
  }
}
