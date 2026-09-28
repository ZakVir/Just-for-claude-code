import CoreVideo
import CoreImage
import Metal
import QuartzCore
import AppKit

// Field order/types must match DissolveShader.metal's DissolveParams exactly.
struct DissolveParams {
    var t: Float
    var threshold: Float
    var band: Float
}

/// Runs each live frame through the Metal dissolve shader and tracks the
/// live/vanishing/gone/returning state machine, mirroring effect.js's
/// Pipeline class. Simplifications from the original browser version are
/// called out inline — see the project README's "effect fidelity" note.
final class EffectEngine {
    enum Mode { case live, vanishing, gone, returning }

    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let pipeline: MTLComputePipelineState
    private var textureCache: CVMetalTextureCache!
    private var outputPool: CVPixelBufferPool?

    private(set) var mode: Mode = .live
    private var transitionStart: CFTimeInterval = 0
    private let transitionDuration: CFTimeInterval = 2.0 // matches DURATION in effect.js
    private let band: Float = 0.12
    private let threshold: Float = 0.16

    private var capturingBackground = false
    private var bgFramesLeft = 0
    private let bgFrameCount = 14 // matches BG_FRAMES in effect.js
    private var bgTexture: MTLTexture?

    init?() {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue(),
              let library = try? device.makeDefaultLibrary(bundle: .main),
              let function = library.makeFunction(name: "dissolveComposite"),
              let pipeline = try? device.makeComputePipelineState(function: function) else {
            NSLog("[Snap] Metal setup failed — the dissolve effect will be unavailable")
            return nil
        }
        self.device = device
        self.queue = queue
        self.pipeline = pipeline
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)
        loadPersistedBackground()
    }

    func beginBackgroundCapture() {
        capturingBackground = true
        bgFramesLeft = bgFrameCount
    }

    func setVanished(_ vanished: Bool) {
        switch (vanished, mode) {
        case (true, .live), (true, .returning):
            transitionStart = CACurrentMediaTime() - Double(1 - progressValue()) * transitionDuration
            mode = .vanishing
        case (false, .gone), (false, .vanishing):
            transitionStart = CACurrentMediaTime() - Double(progressValue()) * transitionDuration
            mode = .returning
        default: break
        }
    }

    /// Call with each incoming live frame; returns the frame to publish.
    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer {
        if capturingBackground {
            // Original effect.js averages BG_FRAMES frames; this keeps the
            // last one after the same countdown, since the subject has
            // already stepped out by then. See README for the trade-off.
            bgFramesLeft -= 1
            if bgFramesLeft <= 0 {
                capturingBackground = false
                bgTexture = makeTexture(from: pixelBuffer)
                persistBackground(pixelBuffer)
            }
        }

        guard mode != .live, let bgTexture else { return pixelBuffer }

        let t = progressValue()
        advanceMode(t: t)

        guard let liveTexture = makeTexture(from: pixelBuffer),
              let outBuffer = makeOutputBuffer(matching: pixelBuffer),
              let outTexture = makeTexture(from: outBuffer),
              let commandBuffer = queue.makeCommandBuffer(),
              let encoder = commandBuffer.makeComputeCommandEncoder() else {
            return pixelBuffer
        }

        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(liveTexture, index: 0)
        encoder.setTexture(bgTexture, index: 1)
        encoder.setTexture(outTexture, index: 2)
        var params = DissolveParams(t: t, threshold: threshold, band: band)
        encoder.setBytes(&params, length: MemoryLayout<DissolveParams>.stride, index: 0)

        let w = pipeline.threadExecutionWidth
        let h = max(1, pipeline.maxTotalThreadsPerThreadgroup / w)
        encoder.dispatchThreadgroups(
            MTLSize(width: (liveTexture.width + w - 1) / w, height: (liveTexture.height + h - 1) / h, depth: 1),
            threadsPerThreadgroup: MTLSize(width: w, height: h, depth: 1))
        encoder.endEncoding()
        commandBuffer.commit()
        commandBuffer.waitUntilCompleted()

        return outBuffer
    }

    private func progressValue() -> Float {
        let elapsed = CACurrentMediaTime() - transitionStart
        let raw = Float(max(0, min(1, elapsed / transitionDuration)))
        switch mode {
        case .vanishing: return raw
        case .returning: return 1 - raw
        case .gone: return 1
        case .live: return 0
        }
    }

    private func advanceMode(t: Float) {
        if mode == .vanishing, t >= 1 { mode = .gone }
        if mode == .returning, t <= 0 { mode = .live }
    }

    // MARK: - Pixel buffer / texture plumbing

    private func makeTexture(from pixelBuffer: CVPixelBuffer) -> MTLTexture? {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault, textureCache, pixelBuffer, nil, .bgra8Unorm, width, height, 0, &cvTexture)
        guard status == kCVReturnSuccess, let cvTexture else { return nil }
        return CVMetalTextureGetTexture(cvTexture)
    }

    private func makeOutputBuffer(matching pixelBuffer: CVPixelBuffer) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        if outputPool == nil {
            let attrs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
                kCVPixelBufferMetalCompatibilityKey as String: true,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
            ]
            CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attrs as CFDictionary, &outputPool)
        }
        guard let outputPool else { return nil }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, outputPool, &buffer)
        return buffer
    }

    private func persistBackground(_ pixelBuffer: CVPixelBuffer) {
        guard let url = SharedState.shared.backgroundImageURL else { return }
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else { return }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: url)
        SharedState.shared.bumpBackgroundVersion()
    }

    /// Restores a background captured in a previous run, so "vanish" can
    /// work again right after the extension restarts without a re-capture.
    private func loadPersistedBackground() {
        guard let url = SharedState.shared.backgroundImageURL,
              let data = try? Data(contentsOf: url),
              let image = NSImage(data: data),
              let pixelBuffer = image.snapToPixelBuffer() else { return }
        bgTexture = makeTexture(from: pixelBuffer)
    }
}

private extension NSImage {
    func snapToPixelBuffer() -> CVPixelBuffer? {
        guard let cgImage = cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let width = cgImage.width, height = cgImage.height
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                             attrs as CFDictionary, &pixelBuffer)
        guard let pixelBuffer else { return nil }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        let context = CGContext(data: CVPixelBufferGetBaseAddress(pixelBuffer), width: width, height: height,
                                 bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixelBuffer
    }
}
