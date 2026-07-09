/**
 * Status, progress, install-record, and result types.
 */

import type { LocalAIError } from '../errors';
import type { Sha256Hex } from './sources';

/** Progress for an in-flight download. `progress` is 0..1 (or `undefined` if size unknown). */
export interface DownloadProgress {
  presetId: string;
  receivedBytes: number;
  totalBytes?: number;
  /** 0..1 when `totalBytes` is known, otherwise undefined. */
  progress?: number;
  /** Instantaneous throughput estimate in bytes/sec, if available. */
  bytesPerSecond?: number;
}

/** A model that has completed download + verification and is recorded in the registry. */
export interface InstalledModel {
  presetId: string;
  /** Absolute app-private path to the installed model file. */
  path: string;
  fileName: string;
  sizeBytes: number;
  /** SHA-256 of the installed file, if it was computed/verified. */
  sha256?: Sha256Hex;
  /** Epoch milliseconds when installation completed. */
  installedAt: number;
}

/** The lifecycle state of a preset, as returned by `getPresetStatus`. */
export type PresetStatus =
  | { state: 'not-installed' }
  | {
      state: 'downloading';
      receivedBytes: number;
      totalBytes?: number;
      progress?: number;
    }
  | { state: 'verifying' }
  | {
      state: 'installed';
      path: string;
      sizeBytes: number;
      sha256?: Sha256Hex;
    }
  | { state: 'failed'; error: LocalAIError };

/** Per-generation throughput/latency statistics. */
export interface GenerationStats {
  /** Number of tokens produced. */
  tokensGenerated: number;
  /** Milliseconds from request to first streamed token. */
  firstTokenMs?: number;
  /** Total wall-clock milliseconds for the generation. */
  totalMs: number;
  /** Decode throughput in tokens/second. */
  tokensPerSecond?: number;
  /** True if the generation stopped because it was cancelled. */
  cancelled: boolean;
  /** Reason generation ended, when known. */
  finishReason?: 'stop' | 'length' | 'cancelled' | 'error';
}

/** Result of `LocalAI.benchmark`. */
export interface BenchmarkResult {
  presetId: string;
  /** Milliseconds to load the model into memory. */
  loadMs: number;
  /** Milliseconds to the first generated token. */
  firstTokenMs?: number;
  /** Decode throughput in tokens/second. */
  tokensPerSecond: number;
  tokensGenerated: number;
  /** Backend that produced the result (e.g. `"llama.cpp"`). */
  runtime: string;
  /** Resolved compute backend, e.g. `"cpu"` | `"gpu"`. */
  backend?: string;
}

/** Device hardware summary used to gate/inform model selection. */
export interface DeviceCapabilities {
  platform: 'android' | 'ios';
  /** Android API level (undefined on iOS). */
  androidApiLevel?: number;
  totalRamBytes?: number;
  freeStorageBytes?: number;
  cpuCores?: number;
  /** Best-effort human-readable device model, e.g. `"SM-S928B"`. */
  deviceModel?: string;
  /** Whether a GPU compute backend is expected to be usable. */
  supportsGpu?: boolean;
}
