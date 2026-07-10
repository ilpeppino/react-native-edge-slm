# Runtimes & backends

Inference runs through a **runtime backend** — a pluggable engine behind a small interface. The
built-in backend is **llama.cpp** (via [`llama.rn`](https://github.com/mybigday/llama.rn)); you
can register your own.

## The default: llama.cpp

A preset with `runtime: 'llama.cpp'` loads through the built-in `llama.rn` backend. It is
created lazily the first time you `loadPreset`/`benchmark`, so you don't wire anything up:

```ts
const runtime = await LocalAI.loadPreset('my-model');
const { text, stats } = await runtime.generate({
  prompt: 'Hello',
  onToken: (t) => append(t),         // streamed tokens
});
runtime.cancel();                    // stop mid-generation
await runtime.unload();              // free memory
```

`generate` is **single-flight**: one generation at a time per runtime (a concurrent call throws
`GenerationBusyError`). `cancel()` maps to the engine's stop and marks the (possibly truncated)
result `cancelled`.

### Platform differences the backend absorbs

The public `Runtime` behaves identically on Android and iOS. Where the underlying `llama.rn` /
llama.cpp layer differs by platform or architecture, the `LlamaRnBackend` adapter normalizes it —
app code never sees the difference:

| Concern | Android (bridge) | iOS (JSI / new arch) | How the adapter normalizes |
| --- | --- | --- | --- |
| `stopCompletion()` return | `Promise<void>` | `undefined` (synchronous) — despite the `Promise<void>` type | `cancel()` wraps it in `Promise.resolve(...)` inside a `try/catch`, so `Runtime.cancel()` is always safe and non-throwing. |
| EOS / end-of-turn | identical (shared C++: `llama_vocab_is_eog`) | identical | No divergence — generation stops on the model's EOS on **both** platforms, provided the prompt uses the model's **chat template** (a raw prompt has no end-of-turn token, so the model runs to the `maxTokens` cap). |
| Cancel semantics | interrupts the blocking decode | interrupts the blocking decode | `BackendRuntime` marks the in-flight result `cancelled` / `finishReason: 'cancelled'` regardless of platform. |

> **Cancel crash (fixed):** earlier code called `this.context.stopCompletion().catch(...)`
> directly. On iOS `stopCompletion()` returns `undefined`, so `.catch` threw
> *"Cannot read property 'catch' of undefined"* and crashed the app on Cancel. The adapter now
> normalizes the return value; see `LlamaRnBackend.cancel()` and its regression tests
> (`__tests__/llamaRnBackend.test.ts`).

## Registering a custom backend

Implement `RuntimeBackend` and register it. A preset whose `runtime` matches the backend's `key`
then loads through it — no fork required. This is how a proprietary app can plug a private engine
(see [private-app-integration.md](./private-app-integration.md)).

```ts
import { LocalAI, type RuntimeBackend } from 'react-native-edge-slm';

const myBackend: RuntimeBackend = {
  key: 'my-engine',
  capabilities: () => ({ runtime: 'my-engine', streaming: true, vision: false, cancellable: true }),
  isAvailable: async () => true,
  load: async ({ modelPath, config }) => ({
    generate: async ({ prompt, onToken }) => {
      // …drive your engine, call onToken(t) per token…
      return { text, stats: { tokensGenerated, totalMs, cancelled: false } };
    },
    cancel: () => {/* stop */},
    unload: async () => {/* release */},
  }),
};

LocalAI.registerBackend(myBackend);
// preset.runtime === 'my-engine' now loads through myBackend
```

## Benchmark

`LocalAI.benchmark(presetId)` loads the model, runs a short generation, and reports:

```ts
const { loadMs, firstTokenMs, tokensPerSecond, tokensGenerated, runtime } =
  await LocalAI.benchmark('my-model', { maxTokens: 64 });
```

It manages its own load/unload, so it's safe to call without an active runtime.

## Self-hosting llama.cpp

Prefer not to depend on `llama.rn`? A scaffolded alternative backend vendors llama.cpp directly
(`runtime: 'llama.cpp-native'`, `NativeLlamaCppBackend`). It is not built yet — see
[cpp-backend.md](./cpp-backend.md) for the design, build matrix, and phased plan, and the
tradeoffs vs the default. Most apps should stay on the default `llama.rn` backend.
