/**
 * End-to-end demo of the react-native-edge-slm public API.
 *
 * This is illustrative — the model URL is a placeholder you must replace with a source you
 * control. It exercises the full MVP call sequence and compiles against the package's types.
 */

import {
  LocalAI,
  LocalAIError,
  ChecksumMismatchError,
  type DownloadProgress,
} from 'react-native-edge-slm';

const PRESET_ID = 'qwen2.5-1.5b-instruct-q4';

export async function runLocalAiDemo(): Promise<void> {
  // 1. Register a preset.
  LocalAI.registerPreset({
    id: PRESET_ID,
    displayName: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    runtime: 'llama.cpp',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    contextLength: 4096,
    minimumDeviceRequirements: { minRamBytes: 3 * 1024 ** 3 },
    defaultGenerationConfig: { temperature: 0.7, maxTokens: 256 },
  });

  // 2. Configure a developer-provided source. Replace with a URL you control.
  LocalAI.configurePresetSource(PRESET_ID, {
    type: 'url',
    url: 'https://example.com/models/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    // sha256: '…64-hex…', // recommended
  });

  try {
    // 3. Status.
    console.log('status:', await LocalAI.getPresetStatus(PRESET_ID));

    // 4. Install with progress.
    await LocalAI.installPreset(PRESET_ID, {
      wifiOnly: true,
      onProgress: (p: DownloadProgress) =>
        console.log(`download ${Math.round((p.progress ?? 0) * 100)}%`),
    });

    // 5. Load.
    const runtime = await LocalAI.loadPreset(PRESET_ID);

    // 6. Stream tokens.
    let streamed = '';
    const { text, stats } = await runtime.generate({
      prompt: 'Explain on-device AI in one sentence.',
      onToken: (t) => {
        streamed += t;
      },
    });
    console.log(streamed || text, `\n${stats.tokensPerSecond ?? '?'} tok/s`);

    // 7. Cancel (no-op here since generation already finished) and 8. unload.
    runtime.cancel();
    await runtime.unload();

    // 9. Benchmark.
    console.log('benchmark:', await LocalAI.benchmark(PRESET_ID));
  } catch (e) {
    if (e instanceof ChecksumMismatchError) {
      console.warn('integrity check failed:', e.details);
    } else if (e instanceof LocalAIError) {
      console.warn(`[${e.code}] ${e.message}`);
    } else {
      throw e;
    }
  }
}
