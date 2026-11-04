import AppKit

struct PresentationLink {
    let deckID: String
    var url: String { "https://docs.google.com/presentation/d/\(deckID)/present" }
    init(_ value: String) throws {
        guard value.count <= 4096, let url = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme == "https", url.host == "docs.google.com", url.port == nil, url.user == nil, url.password == nil,
              let match = url.path.range(of: #"^/presentation/(?:u/\d+/)?d/[A-Za-z0-9_-]+(?:/|$)"#, options: .regularExpression) else { throw AppError("Paste a Google Slides link.") }
        let parts = String(url.path[match]).split(separator: "/")
        guard let d = parts.firstIndex(of: "d"), d + 1 < parts.count, parts[d + 1] != "e" else { throw AppError("Paste the original Google Slides deck link.") }
        deckID = String(parts[d + 1])
    }
}
struct PresentationStatus {
    var ready = false
    var title = "Google Slides"
    var message = "Open your presentation to begin."
    var remoteMessage = "Waiting for the presentation."
    var context: String?
    var dictionary: [String: Any] { ["trusted": true, "running": ready, "frontmost": false, "requiresFocus": false, "message": message, "remoteMessage": remoteMessage] }
}
@MainActor final class BrowserControl {
    struct Target { let id: String; let session: String; var deck: PresentationLink }
    let chrome: ChromePipe
    private let probe: String
    private(set) var target: Target?
    private var contexts: [Int: String] = [:]
    var beforeNavigate: ((String) async throws -> Void)? // Isolated test interception.
    init(chrome: ChromePipe, probe: String) { self.chrome = chrome; self.probe = probe }
    func event(_ event: ChromePipe.Event) {
        if event.method == "Target.targetDestroyed", event.params["targetId"] as? String == target?.id { target = nil; contexts.removeAll() }
        guard event.session == target?.session else { return }
        if event.method == "Runtime.executionContextCreated", let context = event.params["context"] as? [String: Any], let id = context["id"] as? Int, let unique = context["uniqueId"] as? String { contexts[id] = unique }
        if event.method == "Runtime.executionContextDestroyed", let id = event.params["executionContextId"] as? Int { contexts.removeValue(forKey: id) }
        if event.method == "Runtime.executionContextsCleared" { contexts.removeAll() }
    }
    func open(_ value: String, activate: Bool = true) async throws {
        let deck = try PresentationLink(value)
        if let target, (try? await chrome.send("Target.getTargetInfo", ["targetId": target.id])) == nil { self.target = nil }
        if target == nil {
            let result = try await chrome.send("Target.createTarget", ["url": "about:blank", "newWindow": true, "width": 1280, "height": 800])
            guard let id = result["targetId"] as? String, let session = try await chrome.send("Target.attachToTarget", ["targetId": id, "flatten": true])["sessionId"] as? String else { throw AppError("Could not open a presentation window.") }
            target = Target(id: id, session: session, deck: deck); contexts.removeAll()
            _ = try await chrome.send("Runtime.enable", session: session)
            _ = try await chrome.send("Page.enable", session: session)
        }
        target?.deck = deck
        guard let target else { return }
        try await beforeNavigate?(target.session)
        let navigation = try await chrome.send("Page.navigate", ["url": deck.url], session: target.session, timeout: 15)
        if navigation["errorText"] != nil { throw AppError("Could not load the presentation. Check your connection and try again.") }
        if activate { try await show() }
    }
    func show() async throws {
        guard let target else { throw AppError("The presentation window is closed. Reopen your presentation.") }
        _ = try await chrome.send("Target.activateTarget", ["targetId": target.id])
        NSRunningApplication(processIdentifier: chrome.pid)?.activate(from: NSRunningApplication.current, options: [])
    }
    func inspect() async -> PresentationStatus {
        guard let target else { return PresentationStatus(message: "The presentation window is closed. Reopen your presentation.", remoteMessage: "The host’s presentation window is closed.") }
        do { return try await inspect(target) }
        catch { return PresentationStatus(message: "Could not read the presentation. Reopen it to reconnect.", remoteMessage: "The host needs to reconnect the presentation.") }
    }
    private func inspect(_ target: Target) async throws -> PresentationStatus {
        guard let tree = try await chrome.send("Page.getFrameTree", session: target.session)["frameTree"] as? [String: Any], let root = tree["frame"] as? [String: Any], let rootURL = root["url"] as? String else { throw AppError("Presentation unavailable.") }
        let signIn = PresentationStatus(message: "Sign in to Google in the presentation window.", remoteMessage: "The host needs to sign in to Google.")
        if rootURL.hasPrefix("https://accounts.google.com/") { return signIn }
        if rootURL.hasPrefix("chrome-error:") { return PresentationStatus(message: "Chrome could not load the presentation. Check your connection and reload it.", remoteMessage: "The host’s presentation could not load.") }
        guard (try? PresentationLink(rootURL).deckID) == target.deck.deckID else { return PresentationStatus(message: "The selected deck is not open. Reopen your presentation.", remoteMessage: "The host needs to reopen the selected presentation.") }
        var frames: [[String: Any]] = []
        func visit(_ tree: [String: Any]) { guard frames.count < 30 else { return }; if let frame = tree["frame"] as? [String: Any] { frames.append(frame) }; (tree["childFrames"] as? [[String: Any]])?.forEach(visit) }
        visit(tree)
        var unavailable = PresentationStatus(message: "The slideshow is not ready. Check the presentation window.", remoteMessage: "The host’s slideshow is not ready.")
        for frame in frames {
            guard let url = frame["url"] as? String, (try? PresentationLink(url).deckID) == target.deck.deckID, url.range(of: #"/(present|preview|embed)(?:[/?#]|$)"#, options: .regularExpression) != nil, let id = frame["id"] as? String else { continue }
            let world = try await chrome.send("Page.createIsolatedWorld", ["frameId": id, "worldName": "Nextslide presentation"], session: target.session)
            guard let contextID = world["executionContextId"] as? Int, let unique = contexts[contextID] else { continue }
            let value = try await evaluate(["deckId": target.deck.deckID], target: target, context: unique)
            if value["presenting"] as? Bool == true { return PresentationStatus(ready: true, title: value["title"] as? String ?? "Google Slides", message: "Ready. You can use other windows while presenting.", remoteMessage: "Ready", context: unique) }
            switch value["issue"] as? String {
            case "sign-in": unavailable = signIn
            case "access": unavailable = PresentationStatus(message: "This Google account needs access to the deck. Check the presentation window.", remoteMessage: "The host needs access to the presentation.")
            case "loading": unavailable = PresentationStatus(message: "The presentation is loading.", remoteMessage: "The presentation is loading.")
            default: break
            }
        }
        return unavailable
    }
    private func evaluate(_ input: [String: Any], target: Target, context: String) async throws -> [String: Any] {
        let result = try await chrome.send("Runtime.evaluate", ["expression": probe + ";NextslidePresentation.presentationFrame(" + jsonString(input) + ")", "uniqueContextId": context, "returnByValue": true], session: target.session, timeout: 1.8)
        guard result["exceptionDetails"] == nil, let value = (result["result"] as? [String: Any])?["value"] as? [String: Any] else { throw AppError("Could not read the presentation document.") }
        return value
    }
    func dispatch(_ command: [String: Any]) async throws {
        guard let target else { throw AppError("The presentation window is closed.") }
        guard let expiry = command["expiresAt"] as? Double, expiry >= milliseconds(), expiry <= milliseconds() + 5000, ["next", "prev"].contains(command["direction"] as? String ?? ""), let id = command["id"] as? String, id.range(of: #"^[\w-]{16,80}$"#, options: .regularExpression) != nil else { throw AppError("That command expired or is invalid. Check the slide before trying again.") }
        let state = try await inspect(target)
        guard state.ready, let context = state.context else { throw AppError(state.message) }
        let result = try await evaluate(["deckId": target.deck.deckID, "command": command], target: target, context: context)
        guard result["ok"] as? Bool == true else { throw AppError(result["error"] as? String ?? "The presentation did not confirm the command. Check the slide before trying again.") }
    }
}
