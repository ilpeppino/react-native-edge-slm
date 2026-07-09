# cpp/ — self-hosted llama.cpp backend (scaffold)

This is the **alternative** to the default engine. The shipped `llama.cpp` runtime is served by
[`llama.rn`](https://github.com/mybigday/llama.rn) (see [`../src/runtime/backends/LlamaRnBackend.ts`](../src/runtime/backends/LlamaRnBackend.ts)).
This folder scaffolds a backend that vendors **llama.cpp directly** and exposes it through an
in-repo native module — trading extra build/maintenance work for full control over the engine,
build flags, and quantization support.

**Status: scaffold only — not built or wired into the Android/iOS builds.** It exists so the
native work has a fixed contract to satisfy:

- TypeScript boundary: [`NativeLlamaCppBackend`](../src/runtime/backends/NativeLlamaCppBackend.ts)
  (`runtime: 'llama.cpp-native'`), which implements the same `RuntimeBackend` interface as the
  default backend.
- Design, build matrix, and phased plan: [`docs/cpp-backend.md`](../../../docs/cpp-backend.md).

Files here:
- `CMakeLists.txt` — skeleton that would add llama.cpp as a submodule and build a shared library.
- `rn_local_ai_llama.cpp` — skeleton C++ with the intended load / generate(stream) / stop /
  release entry points outlined.

To activate it, a contributor would: add the llama.cpp submodule, wire this `CMakeLists.txt`
into `android/build.gradle` (`externalNativeBuild`) and a podspec build phase, implement the
JNI/JSI bridge, and flip `NativeLlamaCppBackend` from a stub to a real adapter. None of that is
done here.
