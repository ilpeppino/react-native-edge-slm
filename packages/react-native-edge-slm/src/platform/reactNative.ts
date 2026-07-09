/**
 * React Native platform adapters.
 *
 * Bind the abstract boundaries ({@link FileStore}, {@link DownloadTransport},
 * {@link KeyValueStore}, {@link DeviceInfoProvider}) to native modules. This module imports
 * `react-native`, so it is only loaded on-device (the facade `import()`s it lazily). Tests never
 * reach here — they inject Node-backed fakes via `LocalAI.configure(...)`.
 *
 * Expected native modules (namespace `com.reactnativelocalai`):
 *  - `LocalAiFileStore`: file ops + `downloadToFile` + `cancelDownload`, emits
 *    `LocalAiDownloadProgress` events.
 *  - `LocalAiDevice`: `getCapabilities()`.
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

import {
  DownloadHttpError,
  RangeNotSupportedError,
  RetryableDownloadError,
  type DownloadToFileRequest,
  type DownloadToFileResult,
  type DownloadTransport,
} from '../download/DownloadTransport';
import { LocalAIError } from '../errors';
import type { DeviceInfoProvider, LocalAIEnvironment } from '../environment';
import type { FileStore } from '../storage/FileStore';
import type { KeyValueStore } from '../storage/KeyValueStore';
import type { ModelPaths } from '../storage/paths';
import type { DeviceCapabilities } from '../types/status';

interface NativeFileStoreModule {
  paths(): Promise<ModelPaths>;
  ensureDir(dir: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  delete(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  sha256(path: string): Promise<string>;
  freeStorageBytes(): Promise<number>;
  downloadToFile(
    url: string,
    destPath: string,
    fromByte: number,
    headers: Record<string, string>
  ): Promise<{ totalBytes?: number; receivedBytes: number }>;
  cancelDownload(destPath: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface NativeDeviceModule {
  getCapabilities(): Promise<DeviceCapabilities>;
}

interface NativeDownloadError {
  code?: string;
  message?: string;
  userInfo?: { status?: number; retryAfterMs?: number };
}

function mapNativeDownloadError(error: unknown): LocalAIError {
  const e = error as NativeDownloadError;
  switch (e?.code) {
    case 'E_RANGE_NOT_SUPPORTED':
      return new RangeNotSupportedError();
    case 'E_RETRYABLE':
    case 'E_NETWORK':
      return new RetryableDownloadError(e.message ?? 'Network error', {
        retryAfterMs: e.userInfo?.retryAfterMs,
      });
    case 'E_HTTP':
      return new DownloadHttpError(e.userInfo?.status ?? 0);
    default:
      return new RetryableDownloadError(e?.message ?? 'Download error', { cause: error });
  }
}

class ReactNativeFileStore implements FileStore {
  constructor(private readonly native: NativeFileStoreModule) {}
  paths(): Promise<ModelPaths> {
    return this.native.paths();
  }
  ensureDir(dir: string): Promise<void> {
    return this.native.ensureDir(dir);
  }
  exists(path: string): Promise<boolean> {
    return this.native.exists(path);
  }
  size(path: string): Promise<number> {
    return this.native.size(path);
  }
  delete(path: string): Promise<void> {
    return this.native.delete(path);
  }
  move(from: string, to: string): Promise<void> {
    return this.native.move(from, to);
  }
  sha256(path: string): Promise<string> {
    return this.native.sha256(path);
  }
  freeStorageBytes(): Promise<number> {
    return this.native.freeStorageBytes();
  }
}

class ReactNativeKeyValueStore implements KeyValueStore {
  constructor(private readonly native: NativeFileStoreModule) {}
  getItem(key: string): Promise<string | null> {
    return this.native.getItem(key);
  }
  setItem(key: string, value: string): Promise<void> {
    return this.native.setItem(key, value);
  }
  removeItem(key: string): Promise<void> {
    return this.native.removeItem(key);
  }
}

class NativeDownloadTransport implements DownloadTransport {
  private readonly emitter: NativeEventEmitter;
  constructor(private readonly native: NativeFileStoreModule) {
    this.emitter = new NativeEventEmitter(
      native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]
    );
  }

  async downloadToFile(request: DownloadToFileRequest): Promise<DownloadToFileResult> {
    const subscription = this.emitter.addListener(
      'LocalAiDownloadProgress',
      (event: { destPath: string; receivedBytes: number; totalBytes?: number }) => {
        if (event.destPath === request.destPath) {
          request.onProgress?.(event.receivedBytes, event.totalBytes);
        }
      }
    );
    const onAbort = () => {
      void this.native.cancelDownload(request.destPath).catch(() => undefined);
    };
    request.signal?.addEventListener('abort', onAbort);

    try {
      const result = await this.native.downloadToFile(
        request.url,
        request.destPath,
        request.fromByte,
        request.headers ?? {}
      );
      return { totalBytes: result.totalBytes, receivedBytes: result.receivedBytes };
    } catch (error) {
      throw mapNativeDownloadError(error);
    } finally {
      subscription.remove();
      request.signal?.removeEventListener('abort', onAbort);
    }
  }
}

class ReactNativeDeviceInfo implements DeviceInfoProvider {
  constructor(private readonly native: NativeDeviceModule) {}
  getDeviceCapabilities(): Promise<DeviceCapabilities> {
    return this.native.getCapabilities();
  }
}

/** Build the on-device environment from React Native native modules. */
export function createReactNativeEnvironment(): LocalAIEnvironment {
  const fileStoreNative = NativeModules.LocalAiFileStore as NativeFileStoreModule | undefined;
  const deviceNative = NativeModules.LocalAiDevice as NativeDeviceModule | undefined;
  if (!fileStoreNative || !deviceNative) {
    throw new LocalAIError(
      'LOCALAI.RUNTIME_UNAVAILABLE',
      'react-native-edge-slm native modules are not linked. Rebuild the app after installing.'
    );
  }
  return {
    fileStore: new ReactNativeFileStore(fileStoreNative),
    transport: new NativeDownloadTransport(fileStoreNative),
    keyValueStore: new ReactNativeKeyValueStore(fileStoreNative),
    deviceInfo: new ReactNativeDeviceInfo(deviceNative),
  };
}
