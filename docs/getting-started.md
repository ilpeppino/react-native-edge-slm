# Getting started

`react-native-local-ai` lets a React Native app install, load, stream, and benchmark local
GGUF models on-device. Android-first, llama.cpp-first.

> **Release stage.** The public API (types + `RuntimeBackend` seam) is defined and importable
> today. The download/registry lifecycle and the llama.cpp engine land in subsequent stages;
> methods that need them currently throw `NotImplementedError` with a clear message. This guide
> shows the intended end-to-end flow.

## Install

```sh
npm install react-native-local-ai llama.rn
# or: yarn add react-native-local-ai llama.rn
```

`llama.rn` provides the llama.cpp engine.

- **Android** — autolinked; see [android.md](./android.md). `minSdkVersion` 26+, arm64 device.
- **iOS** — run `cd ios && pod install`. Requires iOS 13+ (CryptoKit). Both platforms expose the
  same API and native contract; see the `ios/` and `android/` module READMEs.

## The flow

```ts
import { LocalAI } from 'react-native-local-ai';

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

// 6. Stream tokens.
const { text, stats } = await runtime.generate({
  prompt: 'Explain on-device AI in one sentence.',
  onToken: (t) => console.log(t),
});
console.log(stats.tokensPerSecond, 'tok/s');

// 7. Cancel a long generation at any time.
runtime.cancel();

// 8. Free memory when done.
await runtime.unload();

// 9. Benchmark a device/model pairing.
const bench = await LocalAI.benchmark('qwen2.5-1.5b-instruct-q4');
console.log(bench.loadMs, bench.firstTokenMs, bench.tokensPerSecond);
```

## Error handling

Every failure is a `LocalAIError` (or subclass) with a stable `code`:

```ts
import { LocalAIError, ChecksumMismatchError } from 'react-native-local-ai';

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
