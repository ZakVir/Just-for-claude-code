import CoreMediaIO
import AVFoundation

/// Owns the actual camera work: opens the real, physical camera itself
/// (the extension is the only thing that ever talks to the hardware —
/// FaceTime only ever sees the processed output), runs each frame through
/// the dissolve effect, and publishes the result as the CMIOExtension
/// stream that FaceTime/Zoom/etc. read from.
class SnapStreamSource: NSObject, CMIOExtensionStreamSource, AVCaptureVideoDataOutputSampleBufferDelegate {
    private(set) var stream: CMIOExtensionStream!
    private let streamFormat: CMIOExtensionStreamFormat

    private var captureSession: AVCaptureSession?
    private let effect: EffectEngine? = EffectEngine()
    private let captureQueue = DispatchQueue(label: "com.snap.app.capture")

    init(localizedName: String, streamFormat: CMIOExtensionStreamFormat, device: CMIOExtensionDevice) {
        self.streamFormat = streamFormat
        super.init()
        self.stream = CMIOExtensionStream(localizedName: localizedName, streamID: UUID(),
                                           direction: .source, clockType: .hostTime, source: self)

        SharedState.shared.observeChanges { [weak self] in
            self?.effect?.setVanished(SharedState.shared.vanished)
        }
        SharedState.shared.observeCaptureRequests { [weak self] in
            self?.effect?.beginBackgroundCapture()
        }
    }

    var formats: [CMIOExtensionStreamFormat] { [streamFormat] }

    var availableProperties: Set<CMIOExtensionProperty> { [.streamActiveFormatIndex, .streamFrameDuration] }

    func streamProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionStreamProperties {
        let streamProperties = CMIOExtensionStreamProperties(dictionary: [:])
        if properties.contains(.streamActiveFormatIndex) { streamProperties.activeFormatIndex = 0 }
        if properties.contains(.streamFrameDuration) { streamProperties.frameDuration = CMTime(value: 1, timescale: 30) }
        return streamProperties
    }

    func setStreamProperties(_ streamProperties: CMIOExtensionStreamProperties) throws {}

    func authorizedToStartStream(for client: CMIOExtensionClient) -> Bool { true }

    func startStream() throws {
        let session = AVCaptureSession()
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            throw NSError(domain: "Snap", code: 10, userInfo: [NSLocalizedDescriptionKey: "no physical camera available"])
        }
        session.beginConfiguration()
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: captureQueue)
        session.addOutput(output)
        if session.canSetSessionPreset(.hd1280x720) { session.sessionPreset = .hd1280x720 }
        session.commitConfiguration()
        captureSession = session
        session.startRunning()
    }

    func stopStream() throws {
        captureSession?.stopRunning()
        captureSession = nil
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let processed = effect?.process(pixelBuffer) ?? pixelBuffer
        send(processed, originalTiming: sampleBuffer)
    }

    private func send(_ pixelBuffer: CVPixelBuffer, originalTiming sampleBuffer: CMSampleBuffer) {
        var formatDescription: CMFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixelBuffer,
                                                       formatDescriptionOut: &formatDescription)
        guard let formatDescription else { return }

        var timingInfo = CMSampleTimingInfo()
        CMSampleBufferGetSampleTimingInfo(sampleBuffer, at: 0, timingInfoOut: &timingInfo)

        var outSampleBuffer: CMSampleBuffer?
        CMSampleBufferCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixelBuffer, dataReady: true,
                                            makeDataReadyCallback: nil, refcon: nil, formatDescription: formatDescription,
                                            sampleTiming: &timingInfo, sampleBufferOut: &outSampleBuffer)
        guard let outSampleBuffer else { return }

        let hostTime = UInt64(CMTimeGetSeconds(timingInfo.presentationTimeStamp) * 1_000_000_000)
        stream.send(outSampleBuffer, discontinuity: [], hostTimeInNanoseconds: hostTime)
    }
}
