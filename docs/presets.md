# Presets

A **preset** is a generic descriptor of a model your app can install and run. It carries no
product logic — no prompts, no business rules. You register it once, then address it by `id`.

```ts
interface ModelPreset {
  id: string;                       // stable id, e.g. "qwen2.5-1.5b-instruct-q4"
  displayName: string;
  runtime: 'llama.cpp' | string;    // backend key
  fileName: string;                 // on-disk name once installed (no path separators)
  expectedSizeBytes?: number;       // for storage pre-checks & progress
  contextLength?: number;
  chatTemplate?: string;            // optional, caller-owned; the package attaches no meaning
  capabilities?: { text?: boolean; vision?: boolean };
  minimumDeviceRequirements?: {
    minAndroidApiLevel?: number;
    minRamBytes?: number;
    minFreeStorageBytes?: number;
  };
  defaultGenerationConfig?: GenerationConfig;
}
```

## Generation config

`defaultGenerationConfig` is the baseline applied to `runtime.generate`; each call can override
any field.

```ts
interface GenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];      // stop sequences
  seed?: number;        // deterministic when set
  nThreads?: number;    // CPU threads
  nGpuLayers?: number;  // 0 = CPU only
  nCtx?: number;        // context window
}
```

Only neutral, engine-level parameters — there are no domain/product presets. If you want
opinionated presets (e.g. "creative" vs "precise"), define them in your app and pass them as
`defaultGenerationConfig` or per-call `config`.

## Example

```ts
LocalAI.registerPreset({
  id: 'qwen2.5-1.5b-instruct-q4',
  displayName: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
  runtime: 'llama.cpp',
  fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  expectedSizeBytes: 1_100_000_000,
  contextLength: 4096,
  capabilities: { text: true },
  minimumDeviceRequirements: { minAndroidApiLevel: 26, minRamBytes: 3 * 1024 ** 3 },
  defaultGenerationConfig: { temperature: 0.7, topP: 0.95, maxTokens: 256 },
});
```

## Validation

`registerPreset` validates shape and throws `PresetInvalidError` when `id` / `displayName` /
`runtime` / `fileName` are missing, when `fileName` contains a path separator, or when
`expectedSizeBytes` is not a positive number. Registering the same `id` again replaces it.
