// rn_local_ai_llama.cpp — SCAFFOLD for the self-hosted llama.cpp backend.
//
// This file outlines the intended native entry points that the `NativeLlamaCppBackend`
// TypeScript adapter would call (via JNI today, or JSI for zero-copy streaming later). It does
// NOT link llama.cpp yet — the includes and calls are commented so the scaffold compiles as an
// empty translation unit if someone points a build at it by mistake.
//
// Contract to satisfy (mirrors src/types/runtime.ts RuntimeBackendContext):
//   load(modelPath, {nCtx, nGpuLayers, nThreads})            -> context handle
//   generate(handle, {prompt, ...}, on_token)                -> {text, tokensGenerated, timings}
//   stop(handle)                                             -> interrupts an in-flight decode
//   release(handle)                                          -> frees the context
//
// Streaming: `on_token` is invoked once per decoded token. Over the classic bridge this maps to
// throttled RN events (as the download progress does); over JSI it becomes a host-function call.
// Cancellation reuses the JS-side busy-guard in BackendRuntime; `stop` sets a flag the decode
// loop checks between tokens. See docs/cpp-backend.md.

// #include "llama.h"

#include <string>
#include <functional>

namespace rn_local_ai {

struct GenerationParams {
  std::string prompt;
  int   n_predict   = -1;
  float temperature = 0.8f;
  int   top_k       = 40;
  float top_p       = 0.95f;
  int   seed        = -1;
};

struct GenerationResult {
  std::string text;
  int    tokens_generated = 0;
  double tokens_per_second = 0.0;
  bool   cancelled = false;
};

// Opaque context handle. Real impl wraps llama_model* + llama_context*.
struct Context;

// --- intended API (unimplemented) ---------------------------------------------------------

// Context* load(const std::string& model_path, int n_ctx, int n_gpu_layers, int n_threads);
//
// GenerationResult generate(Context* ctx,
//                           const GenerationParams& params,
//                           const std::function<void(const std::string& token)>& on_token,
//                           const std::function<bool()>& is_cancelled);
//
// void stop(Context* ctx);
// void release(Context* ctx);

}  // namespace rn_local_ai
