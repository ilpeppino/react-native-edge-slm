/**
 * react-native-edge-slm — public entry point.
 *
 * Generic on-device AI runtime for React Native: install, load, stream, benchmark and manage
 * local GGUF models. Android-first, llama.cpp-first. Ships no models and hardcodes no model URLs.
 */

export { LocalAI, LocalAIFacade } from './LocalAI';
export type { InstallOptions, BenchmarkOptions } from './LocalAI';

export * from './types';
export * from './errors';
export { isValidSha256, isHttpsUrl } from './validation';

// ---- Platform boundaries & building blocks (for custom environments / advanced use) ----
export type { LocalAIEnvironment, DeviceInfoProvider } from './environment';
export type { FileStore } from './storage/FileStore';
export { type KeyValueStore, InMemoryKeyValueStore } from './storage/KeyValueStore';
export type { ModelPaths } from './storage/paths';
export { sanitizeSegment, resolveTempPath, resolveInstalledPath, joinPath } from './storage/paths';
export {
  type DownloadTransport,
  type DownloadToFileRequest,
  type DownloadToFileResult,
  RetryableDownloadError,
  DownloadHttpError,
  RangeNotSupportedError,
} from './download/DownloadTransport';
export { DownloadManager } from './download/DownloadManager';
export type { DownloadManagerOptions, DownloadRequest } from './download/DownloadManager';
export { resolveRemoteSource, huggingFaceResolveUrl } from './download/resolveSourceUrl';
export { ModelRegistry } from './registry/ModelRegistry';
export { evaluateDeviceEligibility, type EligibilityResult } from './device/eligibility';
export { BackendRuntime } from './runtime/BackendRuntime';
export { mergeGenerationConfig } from './runtime/mergeConfig';
export {
  NativeLlamaCppBackend,
  NATIVE_LLAMA_CPP_RUNTIME,
} from './runtime/backends/NativeLlamaCppBackend';

// The built-in llama.cpp backend (LlamaRnBackend) is intentionally NOT re-exported here so this
// entry point stays free of a static `llama.rn` import. The facade lazy-imports it on demand,
// and custom backends are supplied via LocalAI.registerBackend(...). NativeLlamaCppBackend (a
// scaffold; see docs/cpp-backend.md) has no native import, so it is safe to export directly.

// The React Native environment factory is intentionally NOT re-exported here to keep this
// entry point free of a static `react-native` import. The facade lazy-imports it on-device.
