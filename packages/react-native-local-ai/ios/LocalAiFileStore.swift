import Foundation
import CryptoKit
import React

/**
 * iOS native backing for the TypeScript `FileStore` + `DownloadTransport` + `KeyValueStore`,
 * mirroring the Android `LocalAiFileStoreModule` contract exactly.
 *
 * App-private storage: `<AppSupport>/localai/models/{temp,installed}`. `downloadToFile` resumes
 * from a byte offset via HTTP `Range` (URLSession streaming), restarts if the server ignores
 * Range, emits throttled `LocalAiDownloadProgress` events, and can be cancelled.
 */
@objc(LocalAiFileStore)
class LocalAiFileStore: RCTEventEmitter {

  private var hasListeners = false
  private var cancelledDownloads = Set<String>()
  private let cancelLock = NSLock()

  override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["LocalAiDownloadProgress"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // MARK: - storage roots

  private func modelsRoot() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("localai/models", isDirectory: true)
  }
  private func tempDir() -> URL { modelsRoot().appendingPathComponent("temp", isDirectory: true) }
  private func installedDir() -> URL {
    modelsRoot().appendingPathComponent("installed", isDirectory: true)
  }

  /// Confine writes/moves/deletes to app-private storage.
  private func assertWithinAppStorage(_ path: String) throws {
    let target = URL(fileURLWithPath: path).standardizedFileURL.path
    let allowed = [
      FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].path,
      FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].path,
      NSTemporaryDirectory(),
    ]
    if !allowed.contains(where: { target == $0 || target.hasPrefix($0 + "/") }) {
      throw NSError(
        domain: "LocalAi", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Path is outside app-private storage: \(path)"])
    }
  }

  // MARK: - file ops

  @objc(paths:reject:)
  func paths(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve([
      "root": modelsRoot().path,
      "tempDir": tempDir().path,
      "installedDir": installedDir().path,
    ])
  }

  @objc(ensureDir:resolve:reject:)
  func ensureDir(_ dir: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      try assertWithinAppStorage(dir)
      try FileManager.default.createDirectory(
        atPath: dir, withIntermediateDirectories: true)
      resolve(nil)
    } catch {
      reject("E_IO", error.localizedDescription, error)
    }
  }

  @objc(exists:resolve:reject:)
  func exists(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(FileManager.default.fileExists(atPath: path))
  }

  @objc(size:resolve:reject:)
  func size(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let attrs = try? FileManager.default.attributesOfItem(atPath: path)
    let bytes = (attrs?[.size] as? NSNumber)?.doubleValue ?? 0
    resolve(bytes)
  }

  @objc(delete:resolve:reject:)
  func delete(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      try assertWithinAppStorage(path)
      if FileManager.default.fileExists(atPath: path) {
        try FileManager.default.removeItem(atPath: path)
      }
      resolve(nil)
    } catch {
      reject("E_IO", error.localizedDescription, error)
    }
  }

  @objc(move:to:resolve:reject:)
  func move(
    _ from: String, to: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock
  ) {
    do {
      try assertWithinAppStorage(from)
      try assertWithinAppStorage(to)
      let destURL = URL(fileURLWithPath: to)
      try FileManager.default.createDirectory(
        at: destURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      if FileManager.default.fileExists(atPath: to) {
        try FileManager.default.removeItem(atPath: to)
      }
      try FileManager.default.moveItem(atPath: from, toPath: to)
      resolve(nil)
    } catch {
      reject("E_IO", error.localizedDescription, error)
    }
  }

  @objc(sha256:resolve:reject:)
  func sha256(_ path: String, resolve: @escaping RCTPromiseResolveBlock,
              reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      guard let handle = FileHandle(forReadingAtPath: path) else {
        reject("E_IO", "cannot open \(path)", nil)
        return
      }
      defer { try? handle.close() }
      var hasher = SHA256()
      while autoreleasepool(invoking: {
        let chunk = handle.readData(ofLength: 1 << 16)
        if chunk.isEmpty { return false }
        hasher.update(data: chunk)
        return true
      }) {}
      let hex = hasher.finalize().map { String(format: "%02x", $0) }.joined()
      resolve(hex)
    }
  }

  @objc(freeStorageBytes:reject:)
  func freeStorageBytes(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let values = try? modelsRoot().resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    let free = values?.volumeAvailableCapacityForImportantUsage ?? 0
    resolve(Double(free))
  }

  // MARK: - key-value store (NSUserDefaults)

  private let kvSuite = UserDefaults(suiteName: "reactnativelocalai.kv.v1")

  @objc(getItem:resolve:reject:)
  func getItem(_ key: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(kvSuite?.string(forKey: key))
  }

  @objc(setItem:value:resolve:reject:)
  func setItem(
    _ key: String, value: String, resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    kvSuite?.set(value, forKey: key)
    resolve(nil)
  }

  @objc(removeItem:resolve:reject:)
  func removeItem(_ key: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    kvSuite?.removeObject(forKey: key)
    resolve(nil)
  }

  // MARK: - resumable download

  private func isCancelled(_ destPath: String) -> Bool {
    cancelLock.lock(); defer { cancelLock.unlock() }
    return cancelledDownloads.contains(destPath)
  }

  @objc(cancelDownload:resolve:reject:)
  func cancelDownload(
    _ destPath: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock
  ) {
    cancelLock.lock(); cancelledDownloads.insert(destPath); cancelLock.unlock()
    resolve(nil)
  }

  @objc(downloadToFile:destPath:fromByte:headers:resolve:reject:)
  func downloadToFile(
    _ url: String, destPath: String, fromByte: Double, headers: [String: String],
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
  ) {
    cancelLock.lock(); cancelledDownloads.remove(destPath); cancelLock.unlock()
    DispatchQueue.global(qos: .utility).async {
      do {
        try self.assertWithinAppStorage(destPath)
        let result = try self.runDownload(
          url: url, destPath: destPath, fromByte: Int64(fromByte), headers: headers)
        resolve(result)
      } catch let e as DownloadRejection {
        reject(e.code, e.message, e.userInfo())
      } catch {
        reject("E_RETRYABLE", error.localizedDescription, error)
      }
      self.cancelLock.lock(); self.cancelledDownloads.remove(destPath); self.cancelLock.unlock()
    }
  }

  private func runDownload(
    url urlString: String, destPath: String, fromByte: Int64, headers: [String: String]
  ) throws -> [String: Any] {
    guard let url = URL(string: urlString) else {
      throw DownloadRejection(code: "E_HTTP", message: "invalid url", status: 0, retryAfterMs: nil)
    }
    var request = URLRequest(url: url, timeoutInterval: 30)
    for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
    if fromByte > 0 { request.setValue("bytes=\(fromByte)-", forHTTPHeaderField: "Range") }

    let delegate = DownloadDelegate(
      destPath: destPath, fromByte: fromByte,
      isCancelled: { [weak self] in self?.isCancelled(destPath) ?? false },
      onProgress: { [weak self] received, total in
        self?.emitProgress(destPath: destPath, received: received, total: total)
      })
    let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
    let task = session.dataTask(with: request)
    delegate.task = task
    task.resume()
    delegate.semaphore.wait()

    if let rejection = delegate.rejection { throw rejection }
    self.emitProgress(destPath: destPath, received: delegate.received, total: delegate.total)
    var out: [String: Any] = ["receivedBytes": Double(delegate.received)]
    if let total = delegate.total { out["totalBytes"] = Double(total) }
    return out
  }

  private func emitProgress(destPath: String, received: Int64, total: Int64?) {
    guard hasListeners else { return }
    var body: [String: Any] = ["destPath": destPath, "receivedBytes": Double(received)]
    if let total = total { body["totalBytes"] = Double(total) }
    sendEvent(withName: "LocalAiDownloadProgress", body: body)
  }

  // Required for NativeEventEmitter parity with Android; RCTEventEmitter provides real ones.
  override func addListener(_ eventName: String) { super.addListener(eventName) }
  override func removeListeners(_ count: Double) { super.removeListeners(count) }
}

/// A typed rejection carrying an error code + optional HTTP status / Retry-After (ms).
private struct DownloadRejection: Error {
  let code: String
  let message: String
  let status: Int?
  let retryAfterMs: Int?
  func userInfo() -> NSError {
    var info: [String: Any] = [NSLocalizedDescriptionKey: message]
    if let status = status { info["status"] = status }
    if let retryAfterMs = retryAfterMs { info["retryAfterMs"] = retryAfterMs }
    return NSError(domain: "LocalAi", code: 2, userInfo: info)
  }
}

/// Streams an HTTP body to a file with Range resume, restart-on-200, cancel and progress.
private final class DownloadDelegate: NSObject, URLSessionDataDelegate {
  let semaphore = DispatchSemaphore(value: 0)
  weak var task: URLSessionDataTask?
  var received: Int64
  var total: Int64?
  var rejection: DownloadRejection?

  private let destPath: String
  private let fromByte: Int64
  private let isCancelled: () -> Bool
  private let onProgress: (Int64, Int64?) -> Void
  private var handle: FileHandle?

  init(destPath: String, fromByte: Int64, isCancelled: @escaping () -> Bool,
       onProgress: @escaping (Int64, Int64?) -> Void) {
    self.destPath = destPath
    self.fromByte = fromByte
    self.received = fromByte
    self.isCancelled = isCancelled
    self.onProgress = onProgress
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let http = response as? HTTPURLResponse else {
      rejection = DownloadRejection(code: "E_RETRYABLE", message: "no response", status: nil, retryAfterMs: nil)
      completionHandler(.cancel); finish(); return
    }
    let status = http.statusCode
    if status == 429 || status >= 500 {
      let retryAfterMs = (http.value(forHTTPHeaderField: "Retry-After")).flatMap { Int($0) }.map { $0 * 1000 }
      rejection = DownloadRejection(code: "E_RETRYABLE", message: "HTTP \(status)", status: status, retryAfterMs: retryAfterMs)
      completionHandler(.cancel); finish(); return
    }
    if status >= 400 {
      rejection = DownloadRejection(code: "E_HTTP", message: "HTTP \(status)", status: status, retryAfterMs: nil)
      completionHandler(.cancel); finish(); return
    }

    // Range honored (206) → append at offset; 200 at an offset → server ignored Range, restart.
    let serverIgnoredRange = fromByte > 0 && status == 200
    let start: Int64 = serverIgnoredRange ? 0 : fromByte
    total = resolveTotal(http: http, status: status, start: start)

    let fm = FileManager.default
    try? fm.createDirectory(
      at: URL(fileURLWithPath: destPath).deletingLastPathComponent(),
      withIntermediateDirectories: true)
    if start == 0 { fm.createFile(atPath: destPath, contents: nil) }
    else if !fm.fileExists(atPath: destPath) { fm.createFile(atPath: destPath, contents: nil) }

    handle = FileHandle(forWritingAtPath: destPath)
    if start == 0 { handle?.truncateFile(atOffset: 0) } else { handle?.seekToEndOfFile() }
    received = start
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    if isCancelled() {
      rejection = DownloadRejection(code: "E_CANCELLED", message: "cancelled", status: nil, retryAfterMs: nil)
      dataTask.cancel(); return
    }
    handle?.write(data)
    received += Int64(data.count)
    onProgress(received, total)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if rejection == nil, let error = error {
      let nsError = error as NSError
      if nsError.code == NSURLErrorCancelled {
        if rejection == nil {
          rejection = DownloadRejection(code: "E_CANCELLED", message: "cancelled", status: nil, retryAfterMs: nil)
        }
      } else {
        rejection = DownloadRejection(code: "E_RETRYABLE", message: error.localizedDescription, status: nil, retryAfterMs: nil)
      }
    }
    finish()
  }

  private func finish() {
    try? handle?.close()
    handle = nil
    semaphore.signal()
  }

  private func resolveTotal(http: HTTPURLResponse, status: Int, start: Int64) -> Int64? {
    if status == 206, let range = http.value(forHTTPHeaderField: "Content-Range"),
       let totalStr = range.split(separator: "/").last, let total = Int64(totalStr) {
      return total
    }
    let len = http.expectedContentLength
    if len < 0 { return nil }
    return start + len
  }
}
