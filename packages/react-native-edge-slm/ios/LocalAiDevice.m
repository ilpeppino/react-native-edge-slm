#import <React/RCTBridgeModule.h>

// Bridges the Swift `LocalAiDevice` module to the React Native bridge.
@interface RCT_EXTERN_MODULE(LocalAiDevice, NSObject)

RCT_EXTERN_METHOD(getCapabilities:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
