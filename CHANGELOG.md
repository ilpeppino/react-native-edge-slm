# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ilpeppino/react-native-local-ai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ilpeppino/react-native-local-ai/releases/tag/v0.1.0
