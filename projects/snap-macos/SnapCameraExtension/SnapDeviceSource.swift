import CoreMediaIO
import CoreAudio
import Foundation

class SnapDeviceSource: NSObject, CMIOExtensionDeviceSource {
    private(set) var device: CMIOExtensionDevice!
    private(set) var streamSource: SnapStreamSource!

    init(localizedName: String) {
        super.init()
        device = CMIOExtensionDevice(localizedName: localizedName, deviceID: UUID(), legacyDeviceID: nil, source: self)

        let dims = CMVideoDimensions(width: 1280, height: 720)
        var formatDescription: CMFormatDescription?
        CMVideoFormatDescriptionCreate(allocator: kCFAllocatorDefault, codecType: kCVPixelFormatType_32BGRA,
                                        width: dims.width, height: dims.height, extensions: nil,
                                        formatDescriptionOut: &formatDescription)
        guard let formatDescription else { fatalError("[Snap] could not build a format description") }

        let streamFormat = CMIOExtensionStreamFormat(
            formatDescription: formatDescription,
            maxFrameDuration: CMTime(value: 1, timescale: 30),
            minFrameDuration: CMTime(value: 1, timescale: 30),
            validFrameDurations: nil)

        streamSource = SnapStreamSource(localizedName: "Snap Camera Stream", streamFormat: streamFormat, device: device)
        do {
            try device.addStream(streamSource.stream)
        } catch {
            fatalError("[Snap] failed to add stream: \(error.localizedDescription)")
        }
    }

    var availableProperties: Set<CMIOExtensionProperty> { [.deviceTransportType, .deviceModel] }

    func deviceProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionDeviceProperties {
        let deviceProperties = CMIOExtensionDeviceProperties(dictionary: [:])
        if properties.contains(.deviceTransportType) {
            deviceProperties.transportType = kIOAudioDeviceTransportTypeVirtual
        }
        if properties.contains(.deviceModel) {
            deviceProperties.model = "Snap Camera Model"
        }
        return deviceProperties
    }

    func setDeviceProperties(_ deviceProperties: CMIOExtensionDeviceProperties) throws {}
}
