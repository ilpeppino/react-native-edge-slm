import Foundation
import React

/// Reports device hardware capabilities backing the TypeScript `DeviceInfoProvider` (iOS).
@objc(LocalAiDevice)
class LocalAiDevice: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(getCapabilities:reject:)
  func getCapabilities(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let free = (try? appSupport.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?
      .volumeAvailableCapacityForImportantUsage ?? 0

    var result: [String: Any] = [
      "platform": "ios",
      "totalRamBytes": Double(ProcessInfo.processInfo.physicalMemory),
      "freeStorageBytes": Double(free),
      "cpuCores": ProcessInfo.processInfo.processorCount,
    ]
    result["deviceModel"] = deviceModelIdentifier()
    resolve(result)
  }

  /// Hardware identifier such as "iPhone16,2".
  private func deviceModelIdentifier() -> String {
    var systemInfo = utsname()
    uname(&systemInfo)
    let mirror = Mirror(reflecting: systemInfo.machine)
    return mirror.children.reduce(into: "") { identifier, element in
      guard let value = element.value as? Int8, value != 0 else { return }
      identifier += String(UnicodeScalar(UInt8(value)))
    }
  }
}
