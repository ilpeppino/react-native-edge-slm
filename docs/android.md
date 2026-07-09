# Android

Android is the first-class target. This page covers native setup, storage, and the runtime
backend.

## Runtime backend

Inference runs on **llama.cpp** via the [`llama.rn`](https://github.com/mybigday/llama.rn)
dependency, wrapped behind this package's `RuntimeBackend` seam. `llama.rn` ships its own
prebuilt native libraries, so **this package vendors no llama.cpp and ships no `.so` files**.
The reserved `cpp/` folder is for a possible future self-hosted backend.

Install both packages:

```sh
npm install react-native-edge-slm llama.rn
```

Autolinking wires up the native modules. Requirements:

- `minSdkVersion` 26+ (recommended for on-device LLMs).
- A 64-bit ABI (`arm64-v8a`) device or emulator. Small models still need meaningful RAM.

## Storage model

Models live in **app-private** storage only — never external/world-readable:

```
filesDir/localai/models/
  temp/       {presetId}.part   ← in-progress downloads (resumable)
  installed/  {fileName}         ← verified, ready to load
```

Install performs an **atomic rename** from `temp/` to `installed/` only after the optional
SHA-256 check passes, so a partially downloaded or corrupt file is never seen as installed.
Uninstalling the app removes all models.

## Downloads

- **Resumable**: interrupted downloads resume from the saved byte offset using HTTP
  `Range: bytes=<offset>-`.
- **Range-aware**: a server that ignores `Range` (returns `200` at a non-zero offset) is
  detected and reported rather than silently corrupting the file.
- **Retry/backoff** on transient `429` / `5xx`, honoring `Retry-After`.
- **Progress** is delivered through throttled events to your `onProgress` callback.

## Device capabilities

`LocalAI.getDeviceCapabilities()` reports platform, Android API level, total RAM, free storage,
CPU cores, and whether a GPU compute backend is expected — used to gate a preset's
`minimumDeviceRequirements` before install/load.

## Cancellation

Native LLM decode can be non-interruptible mid-call. The runtime uses a single-flight
**busy-guard** plus a stop-and-reset path so `runtime.cancel()` reliably halts streaming and
leaves the context in a clean state for the next generation.

> The Kotlin `LocalAiFileStore` (storage + resumable download) and `LocalAiDevice` modules are
> implemented (namespace `com.reactnativelocalai`, autolinked). Inference (`loadPreset`/
> `generate`/`benchmark`) runs through the llama.cpp backend — see [runtimes.md](./runtimes.md).
