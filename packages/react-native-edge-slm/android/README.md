# android/ — native modules

Kotlin native modules (namespace `com.reactnativelocalai`, classic RN bridge) backing the
TypeScript boundaries:

- **`LocalAiFileStore`** (`LocalAiFileStoreModule.kt`) — app-private model storage
  (`filesDir/localai/models/{temp,installed}`), file ops (exists/size/delete/move), streamed
  SHA-256, free-storage checks, a persistent key-value store (SharedPreferences), and the
  resumable **`downloadToFile`**: HTTP `Range` resume via `RandomAccessFile`, restart when the
  server ignores Range, throttled `LocalAiDownloadProgress` events, retryable-vs-fatal error
  mapping, and `cancelDownload`.
- **`LocalAiDevice`** (`LocalAiDeviceModule.kt`) — RAM / CPU-core / free-storage / API-level /
  model-name reporting.

Registered via `LocalAiPackage.kt` (autolinked). The device throughput/benchmark path (tokens/
sec) is provided by the runtime backend and lands with the engine stage.

The llama.cpp inference itself comes from the [`llama.rn`](https://github.com/mybigday/llama.rn)
dependency's own native code, wrapped behind this package's `RuntimeBackend` seam — so this
package does **not** vendor llama.cpp or ship `.so` files. The `cpp/` folder is reserved for a
future self-hosted backend.
