import CoreMediaIO
import Foundation

/// Top-level CMIOExtension object: one provider, one virtual device ("Snap
/// Camera"), one stream. This is the entry every camera-picker menu
/// (FaceTime, Zoom, Photo Booth, …) discovers once the extension is
/// activated and approved.
class SnapProviderSource: NSObject, CMIOExtensionProviderSource {
    private(set) var provider: CMIOExtensionProvider!
    private var deviceSource: SnapDeviceSource!

    init(clientQueue: DispatchQueue?) {
        super.init()
        provider = CMIOExtensionProvider(source: self, clientQueue: clientQueue)
        deviceSource = SnapDeviceSource(localizedName: SnapShared.cameraLocalizedName)
        do {
            try provider.addDevice(deviceSource.device)
        } catch {
            fatalError("[Snap] failed to add device: \(error.localizedDescription)")
        }
    }

    func connect(to client: CMIOExtensionClient) throws {}
    func disconnect(from client: CMIOExtensionClient) {}

    var availableProperties: Set<CMIOExtensionProperty> { [.providerManufacturer] }

    func providerProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionProviderProperties {
        let providerProperties = CMIOExtensionProviderProperties(dictionary: [:])
        if properties.contains(.providerManufacturer) {
            providerProperties.manufacturer = "Snap"
        }
        return providerProperties
    }

    func setProviderProperties(_ providerProperties: CMIOExtensionProviderProperties) throws {}
}
