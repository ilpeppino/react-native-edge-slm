/**
 * Preset schema — a generic, reusable descriptor of a model the app can install and run.
 *
 * A preset carries no product-specific behavior: no prompts, no business logic. `chatTemplate`
 * and `defaultGenerationConfig` are optional and entirely caller-owned.
 */

/** Backend/runtime key. Open union so future backends can be added without a breaking change. */
export type RuntimeKey = 'llama.cpp' | (string & {});

/** Coarse capability flags advertised by a model. */
export interface ModelCapabilities {
  text?: boolean;
  vision?: boolean;
}

/** Minimum device requirements gating install/load of a preset. */
export interface MinimumDeviceRequirements {
  minAndroidApiLevel?: number;
  minRamBytes?: number;
  minFreeStorageBytes?: number;
}

/**
 * Generation parameters. All optional; a backend applies sane defaults for anything omitted.
 * Neutral names only — no product/domain presets.
 */
export interface GenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  /** Stop sequences; generation halts when any is produced. */
  stop?: string[];
  /** Deterministic seed. Omit for nondeterministic sampling. */
  seed?: number;

  // ---- Engine/context knobs (llama.cpp-style; ignored by backends that don't support them) ----
  /** CPU threads used for inference. */
  nThreads?: number;
  /** Layers offloaded to GPU (0 = CPU-only). */
  nGpuLayers?: number;
  /** Context window in tokens. */
  nCtx?: number;
}

/** A registered model descriptor, addressed by {@link ModelPreset.id}. */
export interface ModelPreset {
  /** Stable, caller-chosen id, e.g. `"qwen2.5-1.5b-instruct-q4"`. */
  id: string;
  displayName: string;
  /** Which runtime backend this model targets. */
  runtime: RuntimeKey;
  /** Expected on-disk file name once installed (sanitized before use). */
  fileName: string;
  /** Optional expected download size in bytes (used for storage pre-checks & progress). */
  expectedSizeBytes?: number;
  /** Model context length, if known. */
  contextLength?: number;
  /**
   * Optional chat template. Caller-owned formatting string; this package attaches no meaning
   * to it and ships none by default.
   */
  chatTemplate?: string;
  capabilities?: ModelCapabilities;
  minimumDeviceRequirements?: MinimumDeviceRequirements;
  /** Applied as the baseline for {@link Runtime.generate}, overridable per call. */
  defaultGenerationConfig?: GenerationConfig;
}
