# react-native-local-ai

Run local, on-device LLMs in React Native — install, load, stream, benchmark, and manage
GGUF models with a small, well-typed API. Android-first, [llama.cpp](https://github.com/ggerganov/llama.cpp)-first.

> **Status:** early development. The public API (types + `RuntimeBackend` interface) is
> defined; the download/registry lifecycle and native engine land in staged releases. See
> [`docs/`](./docs) for the design.

## Why

`react-native-local-ai` is the **model lifecycle & management layer** for on-device AI:

- **Presets** — describe a model once (`registerPreset`), then install / load / benchmark it by id.
- **Developer-provided sources** — you point the package at a model URL, a Hugging Face repo,
  a signed URL, a local file, or an app-bundled asset. The package ships **no model binaries
  and no model hosting**.
- **Resumable downloads** into app-private storage, with optional **SHA-256** verification.
- **Local registry** of installed models (paths, sizes, versions).
- **Token streaming**, **cancellation**, **unload**, and a basic **benchmark / device-capability** API.
- **Pluggable runtime backend** — `llama.cpp` (via [`llama.rn`](https://github.com/mybigday/llama.rn))
  is the first implementation; the `RuntimeBackend` seam lets other engines slot in.

The actual inference engine is provided by a backend (llama.cpp today). This package focuses
on everything *around* the engine that apps otherwise have to build themselves.

## Quick taste

```ts
import { LocalAI } from 'react-native-local-ai';

LocalAI.registerPreset({
  id: 'qwen2.5-1.5b-instruct-q4',
  displayName: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
  runtime: 'llama.cpp',
  fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  contextLength: 4096,
});

// You provide the source — the package never hardcodes model URLs.
LocalAI.configurePresetSource('qwen2.5-1.5b-instruct-q4', {
  type: 'url',
  url: 'https://example.com/models/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  sha256: '…', // optional integrity check
});

await LocalAI.installPreset('qwen2.5-1.5b-instruct-q4', {
  onProgress: (p) => console.log(`${Math.round(p.progress * 100)}%`),
});

const runtime = await LocalAI.loadPreset('qwen2.5-1.5b-instruct-q4');
await runtime.generate({
  prompt: 'Explain on-device AI in one sentence.',
  onToken: (t) => process.stdout.write(t),
});
runtime.cancel();       // stop generation
await runtime.unload(); // free memory
```

## Documentation

- [Getting started](./docs/getting-started.md)
- [Model sources](./docs/model-sources.md)
- [Presets](./docs/presets.md)
- [Runtimes & backends](./docs/runtimes.md)
- [Android](./docs/android.md)
- [Security](./docs/security.md)

## You are responsible for model licensing

This package downloads and runs **models you choose**. You are responsible for complying with
each model's license and usage terms. The project ships no weights and hosts no models.

## License

[MIT](./LICENSE)
