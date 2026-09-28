import SwiftUI
import AppKit

struct MenuBarView: View {
    @ObservedObject var controller: SnapController
    @State private var capturing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Circle().fill(dotColor).frame(width: 8, height: 8)
                Text(controller.status).font(.system(size: 12, weight: .medium))
            }

            Button(capturing ? "capturing…" : "capture empty room") {
                capturing = true
                controller.captureBackground { _ in capturing = false }
            }
            .disabled(capturing)

            Button(controller.vanished ? "return" : "vanish") {
                controller.toggle()
            }
            .disabled(!controller.armed && !controller.vanished)

            VStack(alignment: .leading, spacing: 4) {
                Text("snap sensitivity").font(.caption).foregroundStyle(.secondary)
                Slider(value: Binding(
                    get: { controller.sensitivity },
                    set: { controller.setSensitivity($0) }
                ), in: 3...14, step: 0.5)
            }

            Text("Cmd/Ctrl + Shift + X also toggles it. Pick \u{201c}Snap Camera\u{201d} as the camera in FaceTime (or any other app).")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider()
            Button("Quit Snap") { NSApp.terminate(nil) }
        }
        .padding(12)
        .frame(width: 240)
    }

    private var dotColor: Color {
        if controller.vanished { return .purple }
        if controller.armed { return .green }
        return .gray
    }
}
