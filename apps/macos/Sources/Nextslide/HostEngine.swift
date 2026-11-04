import Foundation

struct SpeakerRow: Identifiable {
    let id: String, name: String
    let online: Bool, enabled: Bool
}
@MainActor final class HostEngine {
    let chrome: ChromePipe
    private var session: String?
    private var targetID: String?
    private var ready = false
    var onSnapshot: (([String: Any]) -> Void)?
    var onCommand: (([String: Any]) async throws -> Void)?
    var onEnded: (() -> Void)?
    init(chrome: ChromePipe) { self.chrome = chrome }
    func event(_ event: ChromePipe.Event) {
        guard event.session == session, event.method == "Runtime.bindingCalled", event.params["name"] as? String == "nextslideNative", let text = event.params["payload"] as? String, text.utf8.count < 65536, let message = jsonObject(Data(text.utf8)) else { return }
        switch message["type"] as? String {
        case "engine-ready": ready = true
        case "snapshot": if let snapshot = message["snapshot"] as? [String: Any] { onSnapshot?(snapshot) }
        case "ended": onEnded?()
        case "command":
            guard let command = message["command"] as? [String: Any], let id = command["id"] as? String else { return }
            Task { [weak self] in
                guard let self else { return }
                var error: String?
                do { guard let onCommand else { throw AppError("The session is paused.") }; try await onCommand(command) } catch let failure { error = failure.localizedDescription }
                _ = try? await call("complete", arguments: [id, error as Any? ?? NSNull()])
            }
        default: break
        }
    }
    func prepare(server: LocalServer) async throws {
        if ready { return }
        let target = try await chrome.send("Target.createTarget", ["url": "about:blank", "hidden": true, "background": true])
        guard let id = target["targetId"] as? String, let session = try await chrome.send("Target.attachToTarget", ["targetId": id, "flatten": true])["sessionId"] as? String else { throw AppError("Could not prepare speaker controls.") }
        self.session = session; targetID = id
        _ = try await chrome.send("Runtime.enable", session: session)
        _ = try await chrome.send("Runtime.addBinding", ["name": "nextslideNative"], session: session)
        _ = try await chrome.send("Network.enable", session: session)
        _ = try await chrome.send("Network.setExtraHTTPHeaders", ["headers": ["X-Nextslide-Host": server.hostSecret]], session: session)
        _ = try await chrome.send("Page.navigate", ["url": server.origin + "/engine/index.html"], session: session)
        let deadline = Date().addingTimeInterval(10)
        while !ready {
            try Task.checkCancellation()
            if Date() > deadline { throw AppError("Could not prepare speaker controls. Please try again.") }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }
    @discardableResult func call(_ method: String, arguments: [Any] = [], timeout: Double = 3) async throws -> [String: Any] {
        guard ready, let session else { throw AppError("Speaker controls are not connected.") }
        guard ["start", "stop", "status", "allow", "pause", "complete"].contains(method) else { throw AppError("Unsupported host action.") }
        let expression = "window.nextslideHost." + method + "(..." + jsonString(arguments) + ")"
        let result = try await chrome.send("Runtime.evaluate", ["expression": expression, "awaitPromise": true, "returnByValue": true], session: session, timeout: timeout)
        if let details = result["exceptionDetails"] as? [String: Any] { throw AppError((details["exception"] as? [String: Any])?["description"] as? String ?? "The session could not connect. Please try again.") }
        return result
    }
    func close() async { _ = try? await call("stop"); if let targetID { _ = try? await chrome.send("Target.closeTarget", ["targetId": targetID]) }; ready = false; session = nil; targetID = nil }
}
