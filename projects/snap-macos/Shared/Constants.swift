import Foundation

/// Identifiers shared between the Snap app and its camera extension. Both
/// targets compile this same file (see project.yml).
enum SnapShared {
    static let appGroupID = "group.com.snap.app"
    static let extensionBundleID = "com.snap.app.camera-extension"
    static let cameraLocalizedName = "Snap Camera"

    // Darwin notifications: the only channel that reliably crosses the
    // app <-> system-extension process boundary without XPC plumbing.
    // UserDefaults(suiteName:) writes are visible to both processes once
    // they re-read, but nothing pushes a "you should re-read now" signal
    // across processes on its own — these notifications are that push.
    static let stateChangedNotification = "com.snap.app.stateChanged" as CFString
    static let captureRequestNotification = "com.snap.app.captureRequested" as CFString
}
