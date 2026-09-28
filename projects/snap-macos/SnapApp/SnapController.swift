import AVFoundation
import AppKit
import Combine

/// Owns the host-app side of Snap: activates the camera extension, runs the
/// snap detector and global hotkey, and writes the shared state the
/// extension reads. The extension owns the live camera feed and the actual
/// dissolve effect — this controller only ever asks it to do things.
final class SnapController: ObservableObject {
    static let shared = SnapController()

    @Published var vanished = false
    @Published var armed = false // true once a background has been captured
    @Published var status = "starting…"
    @Published var sensitivity: Double = SharedState.shared.sensitivity

    private let detector = SnapDetector()
    private let hotkeys = HotkeyManager()
    private var captureCountdown: Timer?
    private var captureConfirmTimer: Timer?

    private init() {}

    func start() {
        if let url = SharedState.shared.backgroundImageURL, FileManager.default.fileExists(atPath: url.path) {
            armed = true
        }
        vanished = SharedState.shared.vanished
        sensitivity = SharedState.shared.sensitivity

        ExtensionInstaller.shared.onResult = { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success: self?.status = self?.armed == true ? "armed" : "capture the empty room"
                case .failure(let error): self?.status = "extension error: \(error.localizedDescription)"
                }
            }
        }
        ExtensionInstaller.shared.onNeedsApproval = { [weak self] in
            DispatchQueue.main.async {
                self?.status = "approve Snap in System Settings > Login Items & Extensions"
            }
        }
        ExtensionInstaller.shared.activate()

        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            DispatchQueue.main.async {
                guard granted else { self?.status = "microphone access denied"; return }
                self?.setupDetector()
            }
        }

        hotkeys.start { [weak self] in self?.toggle() }
    }

    private func setupDetector() {
        detector.sensitivity = sensitivity
        detector.onSnap = { [weak self] in self?.toggle() }
        do {
            try detector.start()
        } catch {
            status = "microphone error: \(error.localizedDescription)"
        }
    }

    func toggle() {
        guard armed || vanished else { return }
        vanished.toggle()
        SharedState.shared.vanished = vanished
        status = vanished ? "vanished" : "armed"
    }

    func setSensitivity(_ value: Double) {
        sensitivity = value
        detector.sensitivity = value
        SharedState.shared.sensitivity = value
    }

    /// Tells the extension (which already owns the live camera feed) to
    /// average its next few frames into a new "empty room" background,
    /// after the same 3-second step-out countdown the browser version used.
    func captureBackground(completion: @escaping (Result<Void, Error>) -> Void) {
        captureCountdown?.invalidate()
        var countdown = 3
        status = "step out… \(countdown)"
        captureCountdown = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            countdown -= 1
            if countdown > 0 {
                self.status = "step out… \(countdown)"
            } else {
                timer.invalidate()
                self.status = "saving the room…"
                SharedState.shared.requestBackgroundCapture()
                self.awaitCaptureConfirmation(completion: completion)
            }
        }
    }

    private func awaitCaptureConfirmation(completion: @escaping (Result<Void, Error>) -> Void) {
        captureConfirmTimer?.invalidate()
        let startVersion = SharedState.shared.bgVersion
        var attempts = 0
        captureConfirmTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            attempts += 1
            if SharedState.shared.bgVersion != startVersion {
                timer.invalidate()
                self.armed = true
                self.status = "room saved"
                completion(.success(()))
            } else if attempts > 20 { // ~6s timeout
                timer.invalidate()
                self.status = "capture timed out — is a call open with Snap Camera selected?"
                completion(.failure(NSError(domain: "Snap", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "background capture timed out"])))
            }
        }
    }
}
