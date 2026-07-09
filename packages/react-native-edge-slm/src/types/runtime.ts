/**
 * Runtime backend seam.
 *
 * A {@link RuntimeBackend} is the pluggable engine boundary. `llama.cpp` (via `llama.rn`) is
 * the first implementation; other engines can slot in by implementing this interface. The
 * public {@link Runtime} object returned to callers wraps a loaded backend context.
 */

import type { GenerationConfig, ModelPreset } from './presets';
import type { GenerationStats } from './status';

/** Options for loading a model file into a backend. */
export interface LoadOptions {
  /** Absolute path to the (already installed) model file. */
  modelPath: string;
  /** Baseline generation/engine config; individual `generate` calls may override. */
  config?: GenerationConfig;
  /** Preset that produced this load, for backend diagnostics/telemetry. */
  preset?: ModelPreset;
  /** Abort loading if it exceeds this many milliseconds. */
  timeoutMs?: number;
}

/** Options for a single generation. */
export interface GenerateOptions {
  prompt: string;
  /** Per-call overrides merged over the loaded baseline config. */
  config?: Partial<GenerationConfig>;
  /** Called for each streamed token as it is produced. */
  onToken?: (token: string) => void;
  /** Cancels this generation when aborted. */
  signal?: AbortSignal;
}

/** Result of a completed generation. */
export interface GenerateResult {
  text: string;
  stats: GenerationStats;
}

/**
 * A loaded, ready-to-use model. Returned by `LocalAI.loadPreset`.
 *
 * A `Runtime` is single-flight: only one `generate` may run at a time (enforced with a
 * busy-guard). `cancel` stops an in-flight generation; `unload` releases native resources.
 */
export interface Runtime {
  readonly presetId: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
  /** Request cancellation of the in-flight generation, if any. Safe to call when idle. */
  cancel(): void;
  /** Release the underlying backend context and free memory. Idempotent. */
  unload(): Promise<void>;
}

/** Capabilities a backend advertises about itself. */
export interface RuntimeBackendCapabilities {
  /** Runtime key this backend serves, e.g. `"llama.cpp"`. */
  runtime: string;
  streaming: boolean;
  vision: boolean;
  /** Whether cancellation actually interrupts native decode (vs. best-effort). */
  cancellable: boolean;
}

/** A handle to a loaded backend context, wrapped by the public {@link Runtime}. */
export interface RuntimeBackendContext {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  cancel(): void;
  unload(): Promise<void>;
}

/**
 * The pluggable engine boundary. Implementations own all native/engine specifics; the rest of
 * the package (presets, sources, download, registry) is backend-agnostic.
 */
export interface RuntimeBackend {
  readonly key: string;
  capabilities(): RuntimeBackendCapabilities;
  /** Whether this backend is usable in the current environment (native module present, etc.). */
  isAvailable(): Promise<boolean>;
  /** Load a model file and return a context handle. */
  load(options: LoadOptions): Promise<RuntimeBackendContext>;
}
