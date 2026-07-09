/**
 * Platform environment — the set of I/O boundaries the facade needs.
 *
 * The pure orchestration (download, registry, eligibility) depends only on these interfaces.
 * On-device they resolve to React Native native modules; in tests to Node-backed fakes. This is
 * what lets the exact same lifecycle code run in both places.
 */

import type { DownloadTransport } from './download/DownloadTransport';
import type { FileStore } from './storage/FileStore';
import type { KeyValueStore } from './storage/KeyValueStore';
import type { DeviceCapabilities } from './types/status';

export interface DeviceInfoProvider {
  getDeviceCapabilities(): Promise<DeviceCapabilities>;
}

export interface LocalAIEnvironment {
  fileStore: FileStore;
  transport: DownloadTransport;
  keyValueStore: KeyValueStore;
  deviceInfo: DeviceInfoProvider;
}
