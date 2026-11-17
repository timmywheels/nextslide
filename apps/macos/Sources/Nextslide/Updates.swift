import AppKit
import Sparkle

/// Sparkle updates. Only release builds carry a public key, so development builds never check or offer updates.
/// Scheduled updates must not interrupt a presentation: they appear as a quiet indicator until the host asks for them.
@MainActor final class Updates: NSObject, SPUStandardUserDriverDelegate {
    private var controller: SPUStandardUpdaterController?
    var isPresenting: () -> Bool = { false }
    var onAvailableChanged: (Bool) -> Void = { _ in }

    var enabled: Bool { controller != nil }

    override init() {
        super.init()
        guard Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") != nil else { return }
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: self)
    }

    func check() {
        NSApplication.shared.activate()
        controller?.checkForUpdates(nil)
    }

    nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

    nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(_ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool) -> Bool {
        MainActor.assumeIsolated { immediateFocus && !isPresenting() }
    }

    nonisolated func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        guard !handleShowingUpdate else { return }
        MainActor.assumeIsolated { onAvailableChanged(true) }
    }

    nonisolated func standardUserDriverDidReceiveUserAttention(forUpdate update: SUAppcastItem) {
        MainActor.assumeIsolated { onAvailableChanged(false) }
    }

    nonisolated func standardUserDriverWillFinishUpdateSession() {
        MainActor.assumeIsolated { onAvailableChanged(false) }
    }
}
