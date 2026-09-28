import AVFoundation

/// Finger-snap detector: listens to the microphone and looks for a short,
/// sharp, high-frequency burst. A port of the browser extension's
/// `snapdetect.js` (adaptive noise floor + burst state machine) onto
/// AVAudioEngine instead of the Web Audio API.
final class SnapDetector {
    var onSnap: (() -> Void)?
    /// Multiplier over the room noise floor, lower = more sensitive.
    var sensitivity: Double = 9

    private let engine = AVAudioEngine()
    private var running = false

    // One-pole highpass state (~2500 Hz cutoff) — stands in for the JS
    // BiquadFilter, whose job is to reject the low-frequency rumble a snap
    // doesn't have.
    private var hpAlpha: Float = 0
    private var hpPrevIn: Float = 0
    private var hpPrevOut: Float = 0

    // Burst detector state — same shape as snapdetect.js's step().
    private var floor: Double = 0.004
    private var state = "idle"
    private var peak: Double = 0
    private var t0: Double = 0
    private var lastFire: Double = 0
    private var prev: Double = 0
    private var prev2: Double = 0
    private let minAbs = 0.022

    func start() throws {
        guard !running else { return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        hpAlpha = highpassAlpha(cutoffHz: 2500, sampleRate: Float(format.sampleRate))

        input.installTap(onBus: 0, bufferSize: 512, format: format) { [weak self] buffer, _ in
            self?.process(buffer)
        }
        engine.prepare()
        try engine.start()
        running = true
    }

    func stop() {
        guard running else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        running = false
    }

    private func highpassAlpha(cutoffHz: Float, sampleRate: Float) -> Float {
        let rc = 1 / (2 * Float.pi * cutoffHz)
        let dt = 1 / sampleRate
        return rc / (rc + dt)
    }

    private func process(_ buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0] else { return }
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sumSquares: Double = 0
        for i in 0..<n {
            let x = channel[i]
            let y = hpAlpha * (hpPrevOut + x - hpPrevIn) // one-pole highpass
            hpPrevIn = x
            hpPrevOut = y
            sumSquares += Double(y * y)
        }
        let rms = (sumSquares / Double(n)).squareRoot()
        step(rms: rms, now: Date().timeIntervalSince1970 * 1000)
    }

    private func step(rms: Double, now: Double) {
        defer { prev2 = prev; prev = rms }

        if now - lastFire < 2500 { state = "idle"; return }
        let trigger = max(floor * sensitivity, minAbs)

        switch state {
        case "idle":
            if rms > trigger {
                // a snap starts suddenly: the sound just before it must be quiet
                state = (prev < trigger * 0.4 && prev2 < trigger * 0.4) ? "burst" : "long"
                if state == "burst" { peak = rms; t0 = now }
            } else {
                floor = floor * 0.98 + rms * 0.02
            }
        case "long":
            // a long or gradual sound (speech, hiss, knocks): ignore until quiet again
            if rms < trigger * 0.5 { state = "idle" }
        default: // "burst"
            peak = max(peak, rms)
            let dur = now - t0
            if dur > 140 {
                state = "long" // too long to be a snap
            } else if rms < peak * 0.3 && dur >= 8 { // burst ended quickly
                state = "idle"
                lastFire = now
                let callback = onSnap
                DispatchQueue.main.async { callback?() }
            }
        }
    }
}
