import AppKit
import ApplicationServices

// A persistent helper keeps process startup out of the slide-command path.
// It accepts only two key codes and never changes the foreground application.
let supported = Set([
    "com.google.Chrome", "com.google.Chrome.beta", "com.apple.Safari",
    "org.mozilla.firefox", "com.microsoft.edgemac", "company.thebrowser.Browser",
    "com.apple.iWork.Keynote", "com.microsoft.Powerpoint"
])

// Check the capability used by this executable. AXIsProcessTrusted can retain
// an old per-process verdict after access is changed in System Settings.
if CommandLine.arguments.contains("--permission-status") {
    print(CGPreflightPostEventAccess() ? "true" : "false")
    exit(0)
}

if CommandLine.arguments.count == 3 && ["--icon", "--app-icon"].contains(CommandLine.arguments[1]) {
    let appIcon = CommandLine.arguments[1] == "--app-icon"
    let size = appIcon ? 1024 : 36
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    if appIcon {
        NSColor(calibratedRed: 0.16, green: 0.275, blue: 0.196, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 216, yRadius: 216).fill()
        let transform = NSAffineTransform()
        transform.translateX(by: 160, yBy: 160)
        transform.scale(by: 704.0 / 36.0)
        transform.concat()
        NSColor.white.setStroke()
    } else { NSColor.black.setStroke() }
    let frame = NSBezierPath(roundedRect: NSRect(x: 4, y: 7, width: 28, height: 22), xRadius: 4, yRadius: 4)
    frame.lineWidth = 2.5
    frame.stroke()
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 15, y: 12))
    arrow.line(to: NSPoint(x: 22, y: 18))
    arrow.line(to: NSPoint(x: 15, y: 24))
    arrow.lineWidth = 2.5
    arrow.lineJoinStyle = .round
    arrow.stroke()
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
    exit(0)
}

func respond(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return }
    print(text)
    fflush(stdout)
}

while let line = readLine() {
    autoreleasepool {
        _ = RunLoop.current.run(mode: .default, before: Date())
        guard let data = line.data(using: .utf8),
              let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let id = request["id"] as? Int,
              let action = request["action"] as? String else { return }
        let apps = NSWorkspace.shared.runningApplications.filter {
            $0.activationPolicy == .regular && supported.contains($0.bundleIdentifier ?? "")
        }
        if action == "list" {
            respond(["id": id, "apps": apps.map { ["pid": $0.processIdentifier, "name": $0.localizedName ?? "Presentation", "bundleId": $0.bundleIdentifier ?? ""] as [String: Any] }])
            return
        }
        if action == "request-access" {
            _ = CGRequestPostEventAccess()
            respond(["id": id, "ok": true])
            return
        }
        let trusted = CGPreflightPostEventAccess()
        let pid = (request["pid"] as? Int).map { pid_t($0) }
        let bundleId = request["bundleId"] as? String
        let target = apps.first { $0.processIdentifier == pid && $0.bundleIdentifier == bundleId }
        let frontmost = target != nil && NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        if action == "status" {
            respond(["id": id, "trusted": trusted, "running": target != nil, "frontmost": frontmost])
            return
        }
        guard action == "send", let direction = request["direction"] as? String,
              direction == "next" || direction == "prev" else {
            respond(["id": id, "error": "Unsupported command."]); return
        }
        guard trusted else { respond(["id": id, "error": "Allow Nextslide in macOS Accessibility settings."]); return }
        guard let target = target else { respond(["id": id, "error": "Open your selected presentation app."]); return }
        guard frontmost else { respond(["id": id, "error": "Bring your presentation to the front to resume controls."]); return }
        guard let expiresAt = request["expiresAt"] as? Double, expiresAt >= Date().timeIntervalSince1970 * 1000 else {
            respond(["id": id, "error": "That click expired. Check the slide before trying again."]); return
        }
        let key: CGKeyCode = direction == "next" ? 124 : 123
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false) else {
            respond(["id": id, "error": "Could not create a slide keypress."]); return
        }
        down.flags = []
        up.flags = []
        down.postToPid(target.processIdentifier)
        up.postToPid(target.processIdentifier)
        respond(["id": id, "ok": true])
    }
}
