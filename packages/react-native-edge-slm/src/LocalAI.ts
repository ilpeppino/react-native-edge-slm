/**
 * `LocalAI` — the public facade.
 *
 * Preset registration and source configuration are pure in-memory. The install lifecycle
 * (download → verify → register), status, removal, and device capabilities run through the
 * injected {@link LocalAIEnvironment}: on-device it resolves React Native native modules; in
 * tests it is injected via {@link LocalAIFacade.configure}. `loadPreset`/`benchmark` (the
 * inference engine) land in the engine stage and currently throw {@link NotImplementedError}.
 */

import { DownloadManager } from './download/DownloadManager';
import type { LocalAIEnvironment } from './environment';
import {
  LocalAIError,
  ModelNotInstalledError,
  NotImplementedError,
  PresetNotFoundError,
  SourceNotConfiguredError,
  DeviceUnsupportedError,
} from './errors';
import { ModelRegistry } from './registry/ModelRegistry';
import { evaluateDeviceEligibility } from './device/eligibility';
import { BackendRuntime } from './runtime/BackendRuntime';
import { mergeGenerationConfig } from './runtime/mergeConfig';
import type { GenerationConfig, ModelPreset } from './types/presets';
import { isRemoteSource, type ModelSource } from './types/sources';
import type {
  BenchmarkResult,
  DeviceCapabilities,
  DownloadProgress,
  InstalledModel,
  PresetStatus,
} from './types/status';
import type { Runtime, RuntimeBackend } from './types/runtime';
import { validatePreset, validateSource } from './validation';

const DEFAULT_BENCHMARK_PROMPT = 'Write a short paragraph about the sea.';
const DEFAULT_BENCHMARK_MAX_TOKENS = 64;

/** Options for {@link LocalAIFacade.installPreset}. */
export interface InstallOptions {
  onProgress?: (progress: DownloadProgress) => void;
  /** Refuse to download over a metered/cellular connection. (Enforced by the transport/native.) */
  wifiOnly?: boolean;
  /** Cancels the install when aborted. */
  signal?: AbortSignal;
  /** Skip the device-requirements pre-check for this install. */
  skipDeviceCheck?: boolean;
}

/** Options for {@link LocalAIFacade.benchmark}. */
export interface BenchmarkOptions {
  prompt?: string;
  maxTokens?: number;
}

export class LocalAIFacade {
  private readonly presets = new Map<string, ModelPreset>();
  private readonly sources = new Map<string, ModelSource>();
  /** Ephemeral in-flight status, keyed by preset id (download/verify/failed). */
  private readonly activeStatus = new Map<string, PresetStatus>();

  private environment?: LocalAIEnvironment;
  private downloadManager?: DownloadManager;
  private registry?: ModelRegistry;
  /** Runtime backends by key. `llama.cpp` is lazily created on first use if not registered. */
  private readonly backends = new Map<string, RuntimeBackend>();

  /** Inject a platform environment (native adapters, or Node fakes in tests). */
  configure(environment: LocalAIEnvironment): void {
    this.environment = environment;
    this.downloadManager = undefined;
    this.registry = undefined;
  }

  /**
   * Register a runtime backend, keyed by its {@link RuntimeBackend.key}. A preset whose
   * `runtime` matches that key will load through this backend. This is how a proprietary app
   * plugs a private engine without forking. The built-in `llama.cpp` backend is auto-registered
   * on first use if none is provided.
   */
  registerBackend(backend: RuntimeBackend): void {
    this.backends.set(backend.key, backend);
  }

  registerPreset(preset: ModelPreset): void {
    validatePreset(preset);
    this.presets.set(preset.id, { ...preset });
  }

  configurePresetSource(presetId: string, source: ModelSource): void {
    this.requirePreset(presetId);
    validateSource(source);
    this.sources.set(presetId, source);
  }

  getRegisteredPresets(): ModelPreset[] {
    return [...this.presets.values()].map((p) => ({ ...p }));
  }

  getPreset(presetId: string): ModelPreset | undefined {
    const preset = this.presets.get(presetId);
    return preset ? { ...preset } : undefined;
  }

  getConfiguredSource(presetId: string): ModelSource | undefined {
    return this.sources.get(presetId);
  }

  /** Every installed model currently recorded in the registry (self-healed for missing files). */
  async getInstalledModels(): Promise<InstalledModel[]> {
    const registry = await this.getRegistry();
    return registry.getAll();
  }

  /** Current lifecycle state: in-flight status if downloading, else registry, else not-installed. */
  async getPresetStatus(presetId: string): Promise<PresetStatus> {
    this.requirePreset(presetId);
    const active = this.activeStatus.get(presetId);
    if (active) return active;
    const registry = await this.getRegistry();
    const installed = await registry.get(presetId);
    if (installed) {
      return {
        state: 'installed',
        path: installed.path,
        sizeBytes: installed.sizeBytes,
        sha256: installed.sha256,
      };
    }
    return { state: 'not-installed' };
  }

  /** Download + verify + register a model. */
  async installPreset(presetId: string, options: InstallOptions = {}): Promise<InstalledModel> {
    const preset = this.requirePreset(presetId);
    const source = this.requireSource(presetId);

    if (!options.skipDeviceCheck && preset.minimumDeviceRequirements) {
      const caps = await this.getDeviceCapabilities();
      const verdict = evaluateDeviceEligibility(caps, preset.minimumDeviceRequirements);
      if (!verdict.supported) {
        throw new DeviceUnsupportedError(verdict.reasons);
      }
    }

    try {
      const installed = await this.performInstall(preset, source, options);
      const registry = await this.getRegistry();
      await registry.put(installed);
      this.activeStatus.delete(presetId);
      return installed;
    } catch (error) {
      const localError =
        error instanceof LocalAIError
          ? error
          : new LocalAIError('LOCALAI.DOWNLOAD_FAILED', 'Install failed', { cause: error });
      this.activeStatus.set(presetId, { state: 'failed', error: localError });
      throw localError;
    }
  }

  /**
   * (Re)install a model from its configured source to pick up a newer file.
   *
   * If the model is already installed and the configured source pins a `sha256` that matches the
   * installed file's digest, this is a no-op and returns the current record. Otherwise it
   * downloads + verifies + re-registers from the configured source (same path as
   * {@link installPreset}), replacing the previous file.
   */
  async updatePreset(presetId: string, options: InstallOptions = {}): Promise<InstalledModel> {
    this.requirePreset(presetId);
    const source = this.requireSource(presetId);
    const registry = await this.getRegistry();
    const current = await registry.get(presetId);
    if (
      current &&
      isRemoteSource(source) &&
      source.sha256 &&
      current.sha256 &&
      source.sha256.toLowerCase() === current.sha256.toLowerCase()
    ) {
      return current;
    }
    return this.installPreset(presetId, options);
  }

  /** Remove an installed model, its registry record, and any partial download. */
  async removePreset(presetId: string): Promise<void> {
    this.requirePreset(presetId);
    const registry = await this.getRegistry();
    await registry.remove(presetId);
    const manager = await this.getDownloadManager();
    await manager.cancelAndCleanup(presetId);
    this.activeStatus.delete(presetId);
  }

  /** Load an installed model into its runtime backend and return a ready {@link Runtime}. */
  async loadPreset(presetId: string, config?: Partial<GenerationConfig>): Promise<Runtime> {
    const preset = this.requirePreset(presetId);
    const installed = await this.requireInstalled(presetId);
    const backend = await this.resolveBackend(preset.runtime);
    const mergedDefault = mergeGenerationConfig(preset.defaultGenerationConfig, config);
    const context = await backend.load({
      modelPath: installed.path,
      config: mergedDefault,
      preset,
    });
    return new BackendRuntime(presetId, context, mergedDefault);
  }

  /** Measure load time, first-token latency, and decode throughput for an installed model. */
  async benchmark(presetId: string, options?: BenchmarkOptions): Promise<BenchmarkResult> {
    const preset = this.requirePreset(presetId);
    const installed = await this.requireInstalled(presetId);
    const backend = await this.resolveBackend(preset.runtime);

    const loadStart = Date.now();
    const context = await backend.load({
      modelPath: installed.path,
      config: preset.defaultGenerationConfig,
      preset,
    });
    const loadMs = Date.now() - loadStart;

    try {
      const runtime = new BackendRuntime(presetId, context, preset.defaultGenerationConfig);
      const { stats } = await runtime.generate({
        prompt: options?.prompt ?? DEFAULT_BENCHMARK_PROMPT,
        config: { maxTokens: options?.maxTokens ?? DEFAULT_BENCHMARK_MAX_TOKENS },
      });
      return {
        presetId,
        loadMs,
        firstTokenMs: stats.firstTokenMs,
        tokensPerSecond:
          stats.tokensPerSecond ??
          (stats.totalMs > 0 ? (stats.tokensGenerated * 1000) / stats.totalMs : 0),
        tokensGenerated: stats.tokensGenerated,
        runtime: backend.key,
      };
    } finally {
      await context.unload();
    }
  }

  /** Report device hardware capabilities. */
  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    const env = await this.ensureEnvironment();
    return env.deviceInfo.getDeviceCapabilities();
  }

  /** Test seam: clear registered presets/sources and in-flight status (not the persisted registry). */
  reset(): void {
    this.presets.clear();
    this.sources.clear();
    this.activeStatus.clear();
  }

  // ---- internals ----

  private async performInstall(
    preset: ModelPreset,
    source: ModelSource,
    options: InstallOptions
  ): Promise<InstalledModel> {
    if (isRemoteSource(source)) {
      const manager = await this.getDownloadManager();
      return manager.download({
        presetId: preset.id,
        fileName: preset.fileName,
        source,
        expectedSizeBytes: preset.expectedSizeBytes,
        signal: options.signal,
        onProgress: (progress) => {
          this.activeStatus.set(preset.id, {
            state: 'downloading',
            receivedBytes: progress.receivedBytes,
            totalBytes: progress.totalBytes,
            progress: progress.progress,
          });
          options.onProgress?.(progress);
        },
        onVerifying: () => {
          this.activeStatus.set(preset.id, { state: 'verifying' });
        },
      });
    }

    if (source.type === 'local-file') {
      const env = await this.ensureEnvironment();
      if (!(await env.fileStore.exists(source.path))) {
        throw new LocalAIError(
          'LOCALAI.MODEL_FILE_MISSING',
          `No file at local-file source path for preset "${preset.id}".`,
          { details: { presetId: preset.id } }
        );
      }
      const sizeBytes = await env.fileStore.size(source.path);
      return {
        presetId: preset.id,
        path: source.path,
        fileName: preset.fileName,
        sizeBytes,
        installedAt: Date.now(),
      };
    }

    // app-bundle requires a native asset copy — lands with the native module.
    throw new NotImplementedError('installPreset for app-bundle sources');
  }

  private async ensureEnvironment(): Promise<LocalAIEnvironment> {
    if (this.environment) return this.environment;
    // Lazily resolve the React Native adapters. Never reached in tests (env is injected).
    const platform = await import('./platform/reactNative');
    this.environment = platform.createReactNativeEnvironment();
    return this.environment;
  }

  private async getDownloadManager(): Promise<DownloadManager> {
    if (this.downloadManager) return this.downloadManager;
    const env = await this.ensureEnvironment();
    this.downloadManager = new DownloadManager({
      fileStore: env.fileStore,
      transport: env.transport,
      sessions: env.keyValueStore,
    });
    return this.downloadManager;
  }

  private async getRegistry(): Promise<ModelRegistry> {
    if (this.registry) return this.registry;
    const env = await this.ensureEnvironment();
    this.registry = new ModelRegistry(env.keyValueStore, env.fileStore);
    return this.registry;
  }

  private async requireInstalled(presetId: string): Promise<InstalledModel> {
    this.requirePreset(presetId);
    const registry = await this.getRegistry();
    const installed = await registry.get(presetId);
    if (!installed) throw new ModelNotInstalledError(presetId);
    return installed;
  }

  /** Resolve a backend for a runtime key, lazily creating the built-in llama.cpp one. */
  private async resolveBackend(runtimeKey: string): Promise<RuntimeBackend> {
    const existing = this.backends.get(runtimeKey);
    if (existing) return existing;
    if (runtimeKey === 'llama.cpp') {
      const module = await import('./runtime/backends/LlamaRnBackend');
      const backend = new module.LlamaRnBackend();
      this.backends.set(runtimeKey, backend);
      return backend;
    }
    throw new LocalAIError(
      'LOCALAI.RUNTIME_UNAVAILABLE',
      `No runtime backend registered for "${runtimeKey}". Call LocalAI.registerBackend(...).`,
      { details: { runtime: runtimeKey } }
    );
  }

  private requirePreset(presetId: string): ModelPreset {
    const preset = this.presets.get(presetId);
    if (!preset) throw new PresetNotFoundError(presetId);
    return preset;
  }

  private requireSource(presetId: string): ModelSource {
    const source = this.sources.get(presetId);
    if (!source) throw new SourceNotConfiguredError(presetId);
    return source;
  }
}

/** The shared singleton facade. */
export const LocalAI = new LocalAIFacade();
