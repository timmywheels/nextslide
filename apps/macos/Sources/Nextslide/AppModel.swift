import AppKit
import SwiftUI
import ApplicationServices
import IOKit.pwr_mgt

@MainActor final class AppModel: ObservableObject {
    @Published var link = UserDefaults.standard.string(forKey: "presentationLink") ?? ""
    @Published var mode = "Google Slides"
    @Published var nativeApp = "com.apple.iWork.Keynote"
    @Published var status = PresentationStatus()
    @Published var opened = false
    @Published var busy = false
    @Published var busyLabel = ""
    @Published var invite = ""
    @Published var speakers: [SpeakerRow] = []
    @Published var connected = false
    @Published var error = ""
    @Published var endHovered = false
    @Published var showQR = false
    @Published var copied = false
    @Published var needsAccess = false
    @Published var ending = false
    @Published var connectionState = PublicTunnel.State.idle
    let resources: URL
    private var server: LocalServer?
    private var chrome: ChromePipe?
    private var browser: BrowserControl?
    private var engine: HostEngine?
    private let tunnel = PublicTunnel()
    private var action: Task<Void, Never>?
    private var poll: Task<Void, Never>?
    private var warmup: Task<Void, Never>?
    private var assertion: IOPMAssertionID = 0
    private var shuttingDown = false
    private var knownSpeakers = Set<String>()
    var onHide: (() -> Void)?
    var onPresentationShown: (() -> Void)?
    var onSpeakerJoined: ((String) -> Void)?
    var onSessionStarted: (() -> Void)?
    var onSessionEnded: (() -> Void)?
    var hosting: Bool { !invite.isEmpty }
    var activeSpeaker: SpeakerRow? { speakers.first { $0.enabled && $0.online } }
    var isGoogle: Bool { mode == "Google Slides" }
    init(resources: URL) {
        self.resources = resources
        tunnel.progress = { [weak self] state in self?.connectionState = state }
        tunnel.failed = { [weak self] message in Task {
            guard let self else { return }
            await self.endSession()
            self.error = message
        } }
        poll = Task { [weak self] in
            while !Task.isCancelled {
                if let self, !self.shuttingDown { await self.refresh() }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }
    private func prepareConnection() async throws {
        if server == nil { let server = LocalServer(resources: resources); try await server.start(); self.server = server }
        guard warmup == nil, tunnel.origin == nil, let server else { return }
        warmup = Task { [weak self] in
            guard let self else { return }
            defer { self.warmup = nil }
            // Create the connection while the host opens or signs in to the deck.
            // No speaker session or invite is created until Create invite is chosen.
            _ = try? await self.tunnel.start(service: server.origin, executable: self.resources.appendingPathComponent("cloudflared"))
        }
    }
    private func prepare() async throws {
        try await prepareConnection()
        guard chrome == nil else { return }
        let profile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Nextslide/Presentation Browser")
        let chrome = try await ChromePipe.launch(profile: profile)
        self.chrome = chrome
        let probe = try String(contentsOf: resources.appendingPathComponent("presentation.js"), encoding: .utf8)
        let browser = BrowserControl(chrome: chrome, probe: probe), engine = HostEngine(chrome: chrome)
        self.browser = browser; self.engine = engine
        chrome.onEvent = { [weak browser, weak engine] event in browser?.event(event); engine?.event(event) }
        chrome.onClose = { [weak self] in
            guard let self, !self.shuttingDown else { return }
            self.chrome = nil; self.browser = nil; self.engine = nil
            self.status = PresentationStatus(message: "The presentation browser is closed. Reopen your presentation.")
            Task { await self.endSession(); self.error = "The presentation browser closed. Reopen your presentation to continue." }
        }
        engine.onSnapshot = { [weak self] snapshot in
            guard let self, !self.ending else { return }
            self.invite = snapshot["invite"] as? String ?? ""
            self.connected = snapshot["connected"] as? Bool ?? false
            self.speakers = (snapshot["guests"] as? [[String: Any]] ?? []).compactMap { value in
                guard let id = value["id"] as? String, let name = value["name"] as? String else { return nil }
                return SpeakerRow(id: id, name: name, online: value["online"] as? Bool == true, enabled: value["enabled"] as? Bool == true)
            }
            for speaker in self.speakers where speaker.online && !self.knownSpeakers.contains(speaker.id) {
                self.knownSpeakers.insert(speaker.id)
                self.onSpeakerJoined?(speaker.name)
            }
            if let error = snapshot["error"] as? String, !error.isEmpty { self.error = error }
        }
        engine.onCommand = { [weak self] command in
            guard let self, self.hosting, !self.ending else { throw AppError("The session has ended.") }
            if self.isGoogle { guard let browser = self.browser else { throw AppError("Reopen the presentation.") }; try await browser.dispatch(command) }
            else { try self.nativeCommand(command) }
        }
        engine.onEnded = { [weak self] in Task { await self?.endSession() } }
        _ = try await chrome.send("Target.setDiscoverTargets", ["discover": true])
    }
    func hide() { onHide?() }
    func openPresentation() {
        run("Opening presentation…") {
            if self.isGoogle {
                _ = try PresentationLink(self.link)
                try await self.prepare()
                try await self.browser?.open(self.link)
                UserDefaults.standard.set(self.link.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "presentationLink")
            }
            if !self.isGoogle { try await self.prepareConnection() }
            self.opened = true
            if self.isGoogle { self.onPresentationShown?() }
            await self.refresh()
        }
    }
    func showPresentation() { run("Opening window…") {
        if self.isGoogle { try await self.browser?.show() }
        else if let app = self.runningNative { app.activate(from: NSRunningApplication.current, options: []) }
        self.onPresentationShown?()
    } }
    func createInvite() {
        run("Creating invite…") {
            do {
                try await self.prepare()
                guard let server = self.server, let engine = self.engine else { throw AppError("Could not start the session.") }
                try await engine.prepare(server: server)
                let origin = try await self.tunnel.start(service: server.origin, executable: self.resources.appendingPathComponent("cloudflared"))
                try Task.checkCancellation()
                try await engine.call("start", arguments: [["service": server.origin, "inviteOrigin": origin, "createToken": server.hostSecret]], timeout: 25)
                try Task.checkCancellation()
                await self.refresh()
                self.onSessionStarted?()
                IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn), "Nextslide presentation session" as CFString, &self.assertion)
            } catch {
                await self.endSession()
                throw error
            }
        }
    }
    func allow(_ speaker: SpeakerRow) { Task { do { try await engine?.call("allow", arguments: [speaker.id, !speaker.enabled]) } catch { self.error = error.localizedDescription } } }
    func pause() { Task { do { try await engine?.call("pause") } catch { self.error = error.localizedDescription } } }
    func copyInvite() {
        guard !invite.isEmpty else { return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(invite, forType: .string)
        copied = true
        Task { try? await Task.sleep(nanoseconds: 2_000_000_000); copied = false }
    }
    func end() { action?.cancel(); action = nil; Task { await endSession() } }
    func endSession() async {
        guard !ending else { return }; ending = true
        _ = try? await engine?.call("stop", timeout: 4)
        warmup?.cancel(); warmup = nil
        await tunnel.stop()
        invite = ""; speakers = []; connected = false; copied = false; busy = false
        knownSpeakers.removeAll(); onSessionEnded?()
        if assertion != 0 { IOPMAssertionRelease(assertion); assertion = 0 }
        ending = false
    }
    func changePresentation() { guard !hosting && !busy else { return }; opened = false; error = ""; status = PresentationStatus() }
    private func run(_ label: String, operation: @escaping () async throws -> Void) {
        guard !busy && !ending else { return }
        busy = true; busyLabel = label; error = ""
        action = Task {
            do { try await operation() }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription; if !hosting { warmup?.cancel(); warmup = nil; await tunnel.stop() } }
            busy = false; action = nil
        }
    }
    func refresh() async {
        guard opened else { return }
        if isGoogle { if let browser { status = await browser.inspect() }; needsAccess = false }
        else {
            let trusted = CGPreflightPostEventAccess(), app = runningNative
            let front = app != nil && NSWorkspace.shared.frontmostApplication?.processIdentifier == app?.processIdentifier
            needsAccess = !trusted
            status = PresentationStatus(ready: trusted && front, title: mode,
                message: !trusted ? "Allow Accessibility access to control \(mode)." : app == nil ? "Open \(mode) and start your slideshow." : !front ? "Keep \(mode) in front while speakers control slides." : "Ready for slide control.",
                remoteMessage: !trusted ? "The host needs to allow Accessibility access." : !front ? "Waiting for the host to bring the presentation to the front." : "Ready")
        }
        _ = try? await engine?.call("status", arguments: [status.dictionary])
    }
    var runningNative: NSRunningApplication? { NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == nativeApp } }
    func requestAccess() {
        _ = CGRequestPostEventAccess()
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
        Task { await refresh() }
    }
    private func nativeCommand(_ command: [String: Any]) throws {
        guard let expires = command["expiresAt"] as? Double, expires >= milliseconds(), expires <= milliseconds() + 5000, ["next", "prev"].contains(command["direction"] as? String ?? "") else { throw AppError("This command expired. Check the slide before trying again.") }
        guard CGPreflightPostEventAccess() else { throw AppError("Allow Accessibility access in System Settings.") }
        guard let app = runningNative, NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else { throw AppError("Bring the presentation to the front to resume controls.") }
        let key: CGKeyCode = command["direction"] as? String == "next" ? 124 : 123
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true), let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false) else { throw AppError("Could not send the slide command.") }
        down.flags = []; up.flags = []; down.postToPid(app.processIdentifier); up.postToPid(app.processIdentifier)
    }
    func shutdown() async {
        shuttingDown = true; poll?.cancel(); action?.cancel()
        await endSession(); await engine?.close(); await chrome?.close(); await server?.stop()
    }
}
