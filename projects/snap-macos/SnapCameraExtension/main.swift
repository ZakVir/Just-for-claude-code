import Foundation
import CoreMediaIO

// Camera extensions run as their own process, launched by the system
// (systemextensionsd), not hosted inside another app's process. This is
// the whole entry point: register the provider, then keep the run loop
// alive so CMIOExtension can call back into it as apps request frames.
let providerSource = SnapProviderSource(clientQueue: nil)
CMIOExtensionProvider.startService(provider: providerSource.provider)

CFRunLoopRun()
