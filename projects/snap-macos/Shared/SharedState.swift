import Foundation

/// State shared between the host app and the camera extension via an App
/// Group container (`group.com.snap.app`). The host app writes; both sides
/// can observe. There is no XPC / Mach service involved — settings live in
/// the shared `UserDefaults` suite, the captured background photo lives in
/// the shared container as `background.png`, and Darwin notifications are
/// the cross-process "something changed, go re-read" signal (UserDefaults
/// itself only notifies *within* the process that wrote it).
final class SharedState {
    static let shared = SharedState()

    private let defaults: UserDefaults
    let containerURL: URL?

    private enum Key {
        static let vanished = "snap.vanished"
        static let bgVersion = "snap.bgVersion"
        static let sensitivity = "snap.sensitivity"
    }

    private init() {
        defaults = UserDefaults(suiteName: SnapShared.appGroupID) ?? .standard
        containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SnapShared.appGroupID)
    }

    var vanished: Bool {
        get { defaults.bool(forKey: Key.vanished) }
        set { defaults.set(newValue, forKey: Key.vanished); notify(SnapShared.stateChangedNotification) }
    }

    /// Multiplier over the room noise floor, lower = more sensitive. Mirrors
    /// the browser extension's `S.sensitivity` (default 9, range ~2–20).
    var sensitivity: Double {
        get { let v = defaults.double(forKey: Key.sensitivity); return v == 0 ? 9 : v }
        set { defaults.set(newValue, forKey: Key.sensitivity); notify(SnapShared.stateChangedNotification) }
    }

    private(set) var bgVersion: Int {
        get { defaults.integer(forKey: Key.bgVersion) }
        set { defaults.set(newValue, forKey: Key.bgVersion) }
    }

    var backgroundImageURL: URL? {
        containerURL?.appendingPathComponent("background.png")
    }

    /// Called by the extension once it has written a fresh background.png,
    /// so the host app's "room saved" confirmation can fire.
    func bumpBackgroundVersion() {
        bgVersion += 1
        notify(SnapShared.stateChangedNotification)
    }

    /// Asks the extension (which owns the live camera feed) to average the
    /// next few incoming frames into a new background photo.
    func requestBackgroundCapture() {
        notify(SnapShared.captureRequestNotification)
    }

    func observeChanges(_ handler: @escaping () -> Void) {
        observe(SnapShared.stateChangedNotification, handler: handler)
    }

    func observeCaptureRequests(_ handler: @escaping () -> Void) {
        observe(SnapShared.captureRequestNotification, handler: handler)
    }

    // MARK: - Darwin notification plumbing

    private var handlers: [CFString: [() -> Void]] = [:]

    private func notify(_ name: CFString) {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                                              CFNotificationName(name), nil, nil, true)
    }

    private func observe(_ name: CFString, handler: @escaping () -> Void) {
        let firstForName = handlers[name] == nil
        handlers[name, default: []].append(handler)
        guard firstForName else { return }

        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(), observer,
            { _, _, name, _, _ in
                guard let name else { return }
                SharedState.shared.handlers[name.rawValue as CFString]?.forEach { $0() }
            }, name, nil, .deliverImmediately)
    }
}
