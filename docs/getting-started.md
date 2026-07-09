# Getting started

`react-native-edge-slm` lets a React Native app install, load, stream, and benchmark local
GGUF models on-device. Android-first, llama.cpp-first.

> **Release stage.** The public API (types + `RuntimeBackend` seam) is defined and importable
> today. The download/registry lifecycle and the llama.cpp engine land in subsequent stages;
> methods that need them currently throw `NotImplementedError` with a clear message. This guide
> shows the intended end-to-end flow.

## Install

```sh
npm install react-native-edge-slm llama.rn
# or: yarn add react-native-edge-slm llama.rn
```

`llama.rn` provides the llama.cpp engine.

- **Android** — autolinked; see [android.md](./android.md). `minSdkVersion` 26+, arm64 device.
- **iOS** — run `cd ios && pod install`. Requires iOS 13+ (CryptoKit). Both platforms expose the
  same API and native contract; see the `ios/` and `android/` module READMEs.

## The flow

```ts
import { LocalAI } from 'react-native-edge-slm';

// 1. Register a preset (describe the model once).
LocalAI.registerPreset({
  id: 'qwen2.5-1.5b-instruct-q4',
  displayName: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
  runtime: 'llama.cpp',
  fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  contextLength: 4096,
  minimumDeviceRequirements: { minRamBytes: 3 * 1024 ** 3 },
  defaultGenerationConfig: { temperature: 0.7, maxTokens: 256 },
});

// 2. Point it at a source you control (see model-sources.md).
LocalAI.configurePresetSource('qwen2.5-1.5b-instruct-q4', {
  type: 'url',
  url: 'https://example.com/models/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  sha256: '…64-hex…', // optional integrity check
});

// 3. Check status.
const status = await LocalAI.getPresetStatus('qwen2.5-1.5b-instruct-q4');

// 4. Install (download → verify → register) with progress.
await LocalAI.installPreset('qwen2.5-1.5b-instruct-q4', {
  onProgress: (p) => console.log(`${Math.round((p.progress ?? 0) * 100)}%`),
  wifiOnly: true,
});

// 5. Load into the runtime.
const runtime = await LocalAI.loadPreset('qwen2.5-1.5b-instruct-q4');

// 6. Stream tokens. `generate()` returns a handle you can await for the full result...
const { text, stats } = await runtime.generate({
  prompt: 'Explain on-device AI in one sentence.',
  onToken: (t) => console.log(t),
});
console.log(stats.tokensPerSecond, 'tok/s');

// ...or async-iterate for streamed chunks (breaking the loop cancels the generation).
// NOTE: `for await` needs async-iterator support — see the Hermes caveat below before using it.
for await (const { text } of runtime.generate({ prompt: 'Write a haiku.' })) {
  process.stdout.write(text);
}

// 7. Cancel a long generation at any time.
runtime.cancel();

// 8. Free memory when done.
await runtime.unload();

// 9. Benchmark a device/model pairing.
const bench = await LocalAI.benchmark('qwen2.5-1.5b-instruct-q4');
console.log(bench.loadMs, bench.firstTokenMs, bench.tokensPerSecond);

// Manage installed models.
const installed = await LocalAI.getInstalledModels();
await LocalAI.updatePreset('qwen2.5-1.5b-instruct-q4'); // re-download if the source changed
```

> ⚠️ **Hermes and `for await`.** The async-iteration style needs async-iterator support.
> **Hermes** — React Native's default JS engine on Android (and on iOS when enabled) — does **not**
> provide it, and the React Native Babel preset does **not** transpile `for await` down, so the
> loop can fail at runtime. Options:
>
> - **Use `onToken`** (shown above) — works on every engine, no setup. Recommended for most apps.
> - **Enable a transform + polyfill** if you want `for await`: add
>   `@babel/plugin-transform-async-generator-functions` to `babel.config.js` and a
>   `Symbol.asyncIterator` polyfill at app startup.
> - **Disable Hermes** (use JSC), which supports async iteration natively.
>
> Outside React Native (Node, V8, JSC) `for await` works as-is. Both styles observe the same
> single generation, so `onToken` is a drop-in when async iteration isn't available.

> `EdgeSLM` is an alias for `LocalAI` — `import { EdgeSLM } from 'react-native-edge-slm'` if you
> prefer that name; the API is identical.

## Error handling

Every failure is a `LocalAIError` (or subclass) with a stable `code`:

```ts
import { LocalAIError, ChecksumMismatchError } from 'react-native-edge-slm';

try {
  await LocalAI.installPreset('qwen2.5-1.5b-instruct-q4');
} catch (e) {
  if (e instanceof ChecksumMismatchError) {
    // re-download or surface an integrity warning
  } else if (e instanceof LocalAIError) {
    console.warn(e.code, e.message);
  }
}
```

## Next

- [Presets](./presets.md) — the model descriptor schema.
- [Model sources](./model-sources.md) — where models come from.
- [Android](./android.md) — native setup & storage.
- [Security](./security.md) — HTTPS, checksums, and what this package never does.
