import AppKit
import SwiftUI
import UserNotifications
import Combine

@MainActor public func runNextslide() {
        signal(SIGPIPE, SIG_IGN)
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
}
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private var item: NSStatusItem!
    private let popover = NSPopover()
    private var model: AppModel!
    private var terminating = false
    private var unreadSpeakers = 0
    private var presentationObservation: AnyCancellable?
    private var terminationSignal: DispatchSourceSignal?
    private var updates: Updates!
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let existing = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == Bundle.main.bundleIdentifier && $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            existing.activate(from: NSRunningApplication.current, options: []); NSApplication.shared.terminate(nil); return
        }
        installEditingMenu()
        model = AppModel(resources: Bundle.main.resourceURL!)
        model.onHide = { [weak self] in self?.popover.performClose(nil) }
        model.onPresentationShown = { [weak self] in self?.popover.performClose(nil) }
        UNUserNotificationCenter.current().delegate = self
        model.onSpeakerJoined = { [weak self] name in self?.speakerJoined(name) }
        model.onSessionStarted = { [weak self] in self?.prepareNotifications() }
        model.onSessionEnded = { [weak self] in self?.clearJoinNotifications() }
        updates = Updates()
        updates.isPresenting = { [weak self] in self?.model.opened == true }
        updates.onAvailableChanged = { [weak self] available in self?.model.updateAvailable = available }
        model.onInstallUpdate = { [weak self] in self?.updates.check() }
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = makeMenuBarIcon()
        item.button?.imageScaling = .scaleNone
        item.button?.setAccessibilityLabel("Nextslide")
        item.button?.target = self; item.button?.action = #selector(toggle)
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        item.button?.toolTip = "Nextslide"
        popover.behavior = .applicationDefined
        presentationObservation = model.$opened.sink { [weak self] opened in
            self?.popover.behavior = opened ? .transient : .applicationDefined
        }
        popover.contentViewController = NSHostingController(rootView: HostView(model: model))
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.model?.refresh() } }
        signal(SIGTERM, SIG_IGN)
        terminationSignal = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        terminationSignal?.setEventHandler { NSApplication.shared.terminate(nil) }; terminationSignal?.resume()
        show()
    }
    private func installEditingMenu() {
        let main = NSMenu()
        let application = NSMenuItem(title: "Nextslide", action: nil, keyEquivalent: "")
        let applicationMenu = NSMenu(title: "Nextslide")
        applicationMenu.addItem(withTitle: "Quit Nextslide", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        application.submenu = applicationMenu; main.addItem(application)
        let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let editing = NSMenu(title: "Edit")
        editing.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editing.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editing.addItem(.separator())
        editing.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editing.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editing.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editing.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editing; main.addItem(edit)
        NSApplication.shared.mainMenu = main
    }
    @objc private func toggle() {
        let event = NSApplication.shared.currentEvent
        if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
            showContextMenu()
        } else { popover.isShown ? popover.performClose(nil) : show() }
    }
    private func showContextMenu() {
        guard let button = item.button else { return }
        popover.performClose(nil)
        let menu = NSMenu()
        menu.autoenablesItems = false
        func add(_ title: String, _ action: Selector, enabled: Bool = true) {
            let entry = NSMenuItem(title: title, action: action, keyEquivalent: "")
            entry.target = self; entry.isEnabled = enabled; menu.addItem(entry)
        }
        add("Open Nextslide", #selector(openFromMenu))
        add("Show presentation", #selector(showPresentationFromMenu), enabled: model.opened && !model.busy)
        menu.addItem(.separator())
        add("Copy invite link", #selector(copyInviteFromMenu), enabled: model.hosting)
        add("Pause all", #selector(pauseFromMenu), enabled: model.activeSpeaker != nil)
        add("End session", #selector(endFromMenu), enabled: (model.hosting || model.busy && model.busyLabel == "Creating invite…") && !model.ending)
        menu.addItem(.separator())
        if updates.enabled { add(model.updateAvailable ? "Install update…" : "Check for Updates…", #selector(checkForUpdatesFromMenu)) }
        add("Quit Nextslide", #selector(quitFromMenu))
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.minY), in: button)
    }
    @objc private func openFromMenu() { show() }
    @objc private func showPresentationFromMenu() { model.showPresentation() }
    @objc private func copyInviteFromMenu() { model.copyInvite() }
    @objc private func pauseFromMenu() { model.pause() }
    @objc private func endFromMenu() { model.end() }
    @objc private func checkForUpdatesFromMenu() { updates.check() }
    @objc private func quitFromMenu() { NSApplication.shared.terminate(nil) }
    private func show() {
        guard let button = item?.button else { return }
        clearJoinNotifications()
        NSApplication.shared.activate()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
        Task { await model.refresh() }
    }
    private func prepareNotifications() {
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = try? await center.requestAuthorization(options: [.alert, .sound])
            }
        }
    }
    private func speakerJoined(_ name: String) {
        guard !popover.isShown else { return }
        unreadSpeakers += 1
        item.length = NSStatusItem.variableLength
        item.button?.title = " \(unreadSpeakers)"
        item.button?.imagePosition = .imageLeading
        item.button?.toolTip = "Nextslide — \(unreadSpeakers) new speaker\(unreadSpeakers == 1 ? "" : "s")"
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let content = UNMutableNotificationContent()
            content.title = "Speaker joined"
            content.body = "\(name) is waiting for slide control."
            content.sound = .default
            content.threadIdentifier = "nextslide-speakers"
            content.categoryIdentifier = "nextslide-speaker-joined"
            let request = UNNotificationRequest(identifier: "speaker-" + UUID().uuidString, content: content, trigger: nil)
            try? await center.add(request)
        }
    }
    private func clearJoinNotifications() {
        unreadSpeakers = 0
        item?.button?.title = ""; item?.length = NSStatusItem.variableLength
        item?.button?.toolTip = "Nextslide"
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async { await MainActor.run { self.show() } }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { show(); return true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating || model == nil { return .terminateNow }
        terminating = true
        popover.performClose(nil)
        // .terminateLater spins a nested run loop that cannot drain the main queue, so a terminate call made from a
        // main-queue block (SIGTERM, Sparkle) would deadlock against the cleanup Task. Only logout, which arrives as an
        // Apple Event and must not be cancelled, can wait that way; everything else cancels and terminates again after cleanup.
        let appleEvent = NSAppleEventManager.shared().currentAppleEvent != nil
        Task { await model.shutdown(); appleEvent ? sender.reply(toApplicationShouldTerminate: true) : sender.terminate(nil) }
        return appleEvent ? .terminateLater : .terminateCancel
    }
}
