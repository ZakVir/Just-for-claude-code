import AppKit

/// Global hotkey (Cmd/Ctrl + Shift + X) for vanish/return, working even when
/// Snap isn't the focused app — needed since FaceTime, not Snap, is what's
/// in focus during a call. The first use prompts for Input Monitoring
/// permission (System Settings > Privacy & Security > Input Monitoring).
final class HotkeyManager {
    private var monitor: Any?
    private let kVK_ANSI_X: UInt16 = 7

    func start(onToggle: @escaping () -> Void) {
        monitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [kVK_ANSI_X] event in
            let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            let hasCmdOrCtrl = mods.contains(.command) || mods.contains(.control)
            guard hasCmdOrCtrl, mods.contains(.shift), event.keyCode == kVK_ANSI_X else { return }
            onToggle()
        }
    }

    func stop() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }
}
