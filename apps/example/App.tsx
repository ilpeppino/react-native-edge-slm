/**
 * react-native-edge-slm — example app.
 *
 * Drives the full MVP on-device: register a preset → configure a (developer-provided) model
 * URL → install → load → stream tokens → cancel → unload → benchmark. Drop this component into
 * a React Native app that has `react-native-edge-slm` and `llama.rn` installed.
 *
 * Replace MODEL_URL with a small instruct GGUF you have the rights to use.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  LocalAI,
  type BenchmarkResult,
  type Runtime,
} from 'react-native-edge-slm';

const PRESET_ID = 'demo-model';
const MODEL_URL = 'https://example.com/models/your-model-q4_k_m.gguf';

export default function App(): React.JSX.Element {
  const [modelUrl, setModelUrl] = useState(MODEL_URL);
  const [prompt, setPrompt] = useState('Explain on-device AI in one sentence.');
  const [status, setStatus] = useState('Not installed');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState('');
  const [bench, setBench] = useState<BenchmarkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const runtimeRef = useRef<Runtime | null>(null);

  useEffect(() => {
    LocalAI.registerPreset({
      id: PRESET_ID,
      displayName: 'Demo Model',
      runtime: 'llama.cpp',
      fileName: 'demo-model-q4_k_m.gguf',
      contextLength: 4096,
      defaultGenerationConfig: { temperature: 0.7, maxTokens: 256 },
    });
  }, []);

  const guard = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setStatus(`${label} failed: ${err.code ?? ''} ${err.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const install = () =>
    guard('Install', async () => {
      LocalAI.configurePresetSource(PRESET_ID, { type: 'url', url: modelUrl });
      setStatus('Downloading…');
      await LocalAI.installPreset(PRESET_ID, {
        onProgress: (p) => setProgress(p.progress ?? 0),
      });
      setStatus('Installed');
    });

  const load = () =>
    guard('Load', async () => {
      setStatus('Loading model…');
      runtimeRef.current = await LocalAI.loadPreset(PRESET_ID);
      setStatus('Loaded — ready to generate');
    });

  const generate = () =>
    guard('Generate', async () => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        setStatus('Load the model first');
        return;
      }
      setOutput('');
      setStatus('Generating…');
      const { stats } = await runtime.generate({
        prompt,
        onToken: (t) => setOutput((prev) => prev + t),
      });
      setStatus(
        `Done — ${stats.tokensGenerated} tokens, ${stats.tokensPerSecond?.toFixed(1) ?? '?'} tok/s` +
          (stats.cancelled ? ' (cancelled)' : '')
      );
    });

  const cancel = () => runtimeRef.current?.cancel();

  const unload = () =>
    guard('Unload', async () => {
      await runtimeRef.current?.unload();
      runtimeRef.current = null;
      setStatus('Unloaded');
    });

  const benchmark = () =>
    guard('Benchmark', async () => {
      setStatus('Benchmarking…');
      setBench(await LocalAI.benchmark(PRESET_ID));
      setStatus('Benchmark complete');
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>react-native-edge-slm</Text>

      <Text style={styles.label}>Model URL (a GGUF you provide)</Text>
      <TextInput style={styles.input} value={modelUrl} onChangeText={setModelUrl} autoCapitalize="none" />

      <Text style={styles.label}>Prompt</Text>
      <TextInput style={styles.input} value={prompt} onChangeText={setPrompt} multiline />

      <View style={styles.row}>
        <Button title="Install" onPress={install} disabled={busy} />
        <Button title="Load" onPress={load} disabled={busy} />
        <Button title="Generate" onPress={generate} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button title="Cancel" onPress={cancel} />
        <Button title="Unload" onPress={unload} disabled={busy} />
        <Button title="Benchmark" onPress={benchmark} disabled={busy} />
      </View>

      <View style={styles.statusRow}>
        {busy ? <ActivityIndicator /> : null}
        <Text style={styles.status}>{status}</Text>
      </View>
      {progress > 0 && progress < 1 ? (
        <Text style={styles.status}>Download: {(progress * 100).toFixed(0)}%</Text>
      ) : null}

      <Text style={styles.label}>Output</Text>
      <Text style={styles.output}>{output}</Text>

      {bench ? (
        <Text style={styles.output}>
          load {bench.loadMs} ms · first token {bench.firstTokenMs ?? '?'} ms ·{' '}
          {bench.tokensPerSecond.toFixed(1)} tok/s
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  status: { fontSize: 13, color: '#333' },
  output: { fontFamily: 'monospace', fontSize: 13, minHeight: 40 },
});
