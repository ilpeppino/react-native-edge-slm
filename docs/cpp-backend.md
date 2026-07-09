# Self-hosted llama.cpp backend — design & plan

> **Status: scaffold.** The default `llama.cpp` runtime ships via the [`llama.rn`](https://github.com/mybigday/llama.rn)
> dependency ([`LlamaRnBackend`](../packages/react-native-edge-slm/src/runtime/backends/LlamaRnBackend.ts)).
> This document designs the **alternative** — vendoring llama.cpp directly behind the same
> `RuntimeBackend` interface — and the scaffold that anchors it
> ([`cpp/`](../packages/react-native-edge-slm/cpp), [`NativeLlamaCppBackend`](../packages/react-native-edge-slm/src/runtime/backends/NativeLlamaCppBackend.ts)).

## Why (and why not)

**Default = `llama.rn`.** It gives real GGUF inference + token streaming today, maintained
upstream, with prebuilt binaries. For the vast majority of apps this is the right choice and no
self-hosting is needed.

**Self-hosted may be worth it when** you need: a pinned/patched llama.cpp version, custom build
flags (specific SIMD/GPU backends, quant types), a smaller binary by dropping features, or JSI
zero-copy streaming beyond what the dependency exposes.

**Cost:** you own an NDK/CMake build across an ABI matrix, track llama.cpp upstream (ABI churn),
and maintain the JNI/JSI bridge. This is a standing maintenance burden — take it on deliberately.

## Where it plugs in

Nothing about the lifecycle changes. The backend is selected by a preset's `runtime` key:

- default `llama.cpp` → `LlamaRnBackend`
- self-hosted `llama.cpp-native` → `NativeLlamaCppBackend`

```ts
import { LocalAI, NativeLlamaCppBackend } from 'react-native-edge-slm';
LocalAI.registerBackend(new NativeLlamaCppBackend());
LocalAI.registerPreset({ id: 'm', runtime: 'llama.cpp-native', /* … */ });
```

Download, registry, device, benchmark, and the single-flight/cancel policy in `BackendRuntime`
are all reused unchanged. The native backend only has to satisfy `RuntimeBackendContext`:
`generate(options) → {text, stats}`, `cancel()`, `unload()`.

## Native contract

Outlined in [`cpp/rn_local_ai_llama.cpp`](../packages/react-native-edge-slm/cpp/rn_local_ai_llama.cpp):

| JS call | Native |
|---|---|
| `backend.load({modelPath, config})` | `load(model_path, n_ctx, n_gpu_layers, n_threads)` → context handle |
| `context.generate({prompt, config, onToken})` | `generate(handle, params, on_token, is_cancelled)` → `{text, tokens, tps}` |
| `context.cancel()` | `stop(handle)` — sets a flag the decode loop checks between tokens |
| `context.unload()` | `release(handle)` |

## Bridge: JNI first, JSI later

- **Phase 1 — classic bridge (JNI/Obj-C).** `generate` runs on a background thread; each decoded
  token is emitted as a throttled `LocalAiLlamaToken` event (exactly the pattern the download
  module already uses for progress). Simplest to ship; token events cross the bridge serialized.
- **Phase 2 — JSI.** Install a host function so `on_token` calls straight into JS without the
  bridge, reducing per-token overhead for fast models. Optional optimization, same public API.

Cancellation reuses the JS busy-guard in `BackendRuntime`; `stop()` flips an `atomic<bool>` the
C++ decode loop checks each iteration (llama.cpp decode is interruptible between tokens, so no
executor-reset hack is needed — unlike the LiteRT-style blocking call the patterns came from).

## Build matrix

| Axis | Target |
|---|---|
| Android ABIs | `arm64-v8a` (required), `x86_64` (emulator); drop `armeabi-v7a` |
| Android build | `externalNativeBuild { cmake { path "cpp/CMakeLists.txt" } }`, NDK r26+, `minSdk 26` |
| iOS | CocoaPods build phase compiling the same sources; `arm64` device + `arm64` sim |
| llama.cpp | git submodule at `cpp/llama.cpp`, **pinned to an exact tag**, updated deliberately |
| Packaging | `.so`/static lib built at app-build time — **never** commit binaries; keep `*.so` git-ignored |
| Size | `LLAMA_BUILD_TESTS/EXAMPLES/SERVER=OFF`; enable only needed GPU backends |

## Testing strategy

- **JS/orchestration** stays fully covered by the existing `FakeBackend` tests — no device needed.
- **Native** needs on-device/emulator integration: load a small GGUF, stream tokens, cancel
  mid-decode, unload, and compare `benchmark` tokens/sec against `llama.rn` for sanity.
- Add a CI job (macOS/Linux runners with NDK) that at least **compiles** the native lib per ABI;
  full inference tests require a device lane.

## Phased plan

1. **Submodule + build green.** Add `cpp/llama.cpp` (pinned), wire `CMakeLists.txt` into
   `android/build.gradle`, confirm the `.so` builds for `arm64-v8a`/`x86_64`. No inference yet.
2. **JNI load/generate/stop/release.** Implement the four entry points; stream tokens via events;
   flip `NativeLlamaCppBackend` from stub to real adapter (module `LocalAiLlamaCpp`).
3. **iOS build phase** compiling the same sources; parity check.
4. **Benchmark + polish.** Wire timings into `stats`, compare vs `llama.rn`, document flags.
5. **(Optional) JSI streaming** for per-token overhead.

## Tradeoffs vs the default

| | `llama.rn` (default) | self-hosted |
|---|---|---|
| Time to working | now | phases 1–2 of native work |
| Maintenance | upstream | you (build + bridge + upstream tracking) |
| Control (flags, quant, version) | limited | full |
| Binary size | as shipped | tunable |
| Streaming | events | events → JSI |

Recommendation: stay on `llama.rn` unless a concrete need (pinned version, custom flags, size,
or JSI throughput) justifies the maintenance. The scaffold keeps that door open at a fixed
contract without committing the project to the native build now.
