# Example app

Drives the full `react-native-edge-slm` MVP on-device:

register preset → configure a (developer-provided) model URL → install → load → **stream
tokens** → cancel → unload → benchmark.

- [`App.tsx`](./App.tsx) — a complete React Native screen with buttons and live streaming output.
  Drop it into an RN app that has `react-native-edge-slm` and `llama.rn` installed, then set
  `MODEL_URL` to a small instruct GGUF you have the rights to use.
- [`localAiDemo.ts`](./localAiDemo.ts) — the same flow headless, as a plain call sequence.

## Running it

1. Create (or use) a React Native app and install both packages:
   ```sh
   npm install react-native-edge-slm llama.rn
   ```
2. Render `App` from `App.tsx`.
3. Build and run on an Android device/emulator (arm64, enough RAM for your model).
4. Paste a GGUF URL, then: **Install → Load → Generate**. Use **Cancel** mid-stream, **Unload**
   to free memory, and **Benchmark** for tokens/sec.

A standalone runnable RN project (Gradle app wrapper) is not committed here to keep the repo
lean; `App.tsx` is the drop-in component that exercises the whole public API.
