# ios/ — native modules

Swift native modules mirroring the Android contract, so the TypeScript boundaries
(`FileStore` / `DownloadTransport` / `KeyValueStore` / `DeviceInfoProvider`) work identically
on iOS:

- **`LocalAiFileStore`** (`LocalAiFileStore.swift` + `.m`) — app-private storage under
  `<AppSupport>/localai/models/{temp,installed}`, file ops, streamed **CryptoKit** SHA-256, a
  `NSUserDefaults`-backed key-value store, and resumable **`downloadToFile`** (URLSession `Range`
  resume, restart-on-200, throttled `LocalAiDownloadProgress` events via `RCTEventEmitter`,
  `cancelDownload`). Writes are confined to app-private storage.
- **`LocalAiDevice`** (`LocalAiDevice.swift` + `.m`) — RAM / CPU-core / free-storage / hardware
  identifier reporting.

Linked via `react-native-local-ai.podspec` (`pod install`). Requires **iOS 13+** (CryptoKit).

The llama.cpp inference itself is provided by `llama.rn`'s own iOS build, wrapped behind this
package's `RuntimeBackend` seam — no engine code is vendored here.
