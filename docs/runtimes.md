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
