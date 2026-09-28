import SwiftUI

@main
struct SnapMenuBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var controller = SnapController.shared

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(controller: controller)
        } label: {
            Image(systemName: controller.vanished ? "sparkles" : "video.fill")
        }
        .menuBarExtraStyle(.window)
    }
}
