import Foundation
import SystemExtensions

/// Wraps the one-time (and once-per-rebuild-during-dev) dance of asking
/// macOS to activate the camera extension. The user has to approve this in
/// System Settings > General > Login Items & Extensions the first time.
final class ExtensionInstaller: NSObject, OSSystemExtensionRequestDelegate {
    static let shared = ExtensionInstaller()

    var onResult: ((Result<OSSystemExtensionRequest.Result, Error>) -> Void)?
    var onNeedsApproval: (() -> Void)?

    func activate() {
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: SnapShared.extensionBundleID, queue: .main)
        request.delegate = self
        OSSystemExtensionManager.shared.submitRequest(request)
    }

    func request(_ request: OSSystemExtensionRequest,
                 didFinishWithResult result: OSSystemExtensionRequest.Result) {
        onResult?(.success(result))
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        onResult?(.failure(error))
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        onNeedsApproval?()
    }

    func request(_ request: OSSystemExtensionRequest,
                 actionForReplacingExtension existing: OSSystemExtensionProperties,
                 withExtension ext: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }
}
