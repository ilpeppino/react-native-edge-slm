# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Streaming via async iteration** — `Runtime.generate()` now returns a `GenerationHandle` that
  is both awaitable (`await runtime.generate(...)` → `GenerateResult`, unchanged) **and**
  async-iterable (`for await (const { text } of runtime.generate(...))`). Breaking out of the
  loop early cancels the in-flight generation. The `onToken` callback keeps working alongside
  either style. New `TokenChunk` / `GenerationHandle` types are exported. Non-breaking.
- **`LocalAI.getInstalledModels()`** — returns every installed model recorded in the registry
  (self-healed for missing files).
- **`LocalAI.updatePreset(id, options?)`** — (re)installs a model from its configured source to
  pick up a newer file; a no-op when the source pins a `sha256` that matches the installed file.
- **`EdgeSLM`** — brand alias export for the `LocalAI` singleton (`import { EdgeSLM } from
  'react-native-edge-slm'`).

## [0.1.0] - 2026-07-09

First public release. Android-first, llama.cpp-first.

### Added

- **Public API & types** — `LocalAI` facade (`registerPreset`, `configurePresetSource`,
  `getPresetStatus`, `installPreset`, `removePreset`, `loadPreset`, `benchmark`,
  `getDeviceCapabilities`, `registerBackend`), model source schema (`url` / `signed-url` /
  `huggingface` / `local-file` / `app-bundle`), preset & generation-config schema, and a typed
  `LocalAIError` taxonomy.
- **Model lifecycle** (pure TS over injectable boundaries) — resumable HTTP-range downloads with
  retry/backoff, optional SHA-256 verification, atomic install into app-private storage, a local
  model registry (installed records + selected pointer, self-healing), and device-eligibility
  checks.
- **Runtime engine** — pluggable `RuntimeBackend` seam with a single-flight `Runtime`
  (busy-guard, cancellation, unload). Built-in `llama.cpp` backend via `llama.rn` with token
  streaming; `LocalAI.benchmark` reporting load time, first-token latency, and tokens/sec.
- **Android native modules** (`com.reactnativelocalai`) — `LocalAiFileStore` (app-private
  storage, streamed SHA-256, key-value store, resumable `downloadToFile` + cancel + progress)
  and `LocalAiDevice`.
- **iOS native modules** — Swift `LocalAiFileStore` (CryptoKit SHA-256, `NSUserDefaults` KV,
  URLSession resumable download) and `LocalAiDevice`; CocoaPods podspec (iOS 13+).
- **Self-hosted llama.cpp backend** — scaffold (`NativeLlamaCppBackend`, `cpp/` CMake + C++
  skeleton) and design doc (`docs/cpp-backend.md`).
- **Example app** — `apps/example/App.tsx` driving install → load → stream → cancel → unload →
  benchmark.
- **Docs** — getting-started, model-sources, presets, runtimes, android, security,
  private-app-integration, cpp-backend.
- **Project infrastructure** — CI (leak-gate → typecheck → test → build), secret/private-asset
  leak gate, `CONTRIBUTING.md`, PR & issue templates, and a release/publish workflow.

[Unreleased]: https://github.com/ilpeppino/react-native-edge-slm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ilpeppino/react-native-edge-slm/releases/tag/v0.1.0
