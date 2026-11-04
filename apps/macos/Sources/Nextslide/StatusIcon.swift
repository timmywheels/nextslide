import AppKit

// A wide canvas preserves the overlapping slides’ proportions. The status item
// sizes to this image instead of shrinking it into a square button.
@MainActor func makeMenuBarIcon() -> NSImage {
    let symbol = NSImage(systemSymbolName: "rectangle.on.rectangle.angled", accessibilityDescription: nil)!
        .withSymbolConfiguration(.init(pointSize: 16, weight: .semibold))!
    let icon = NSImage(size: NSSize(width: 22, height: 18), flipped: false) { bounds in
        let scale = min((bounds.width - 1) / symbol.size.width, (bounds.height - 1) / symbol.size.height)
        let size = NSSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
        symbol.draw(in: NSRect(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2, width: size.width, height: size.height))
        return true
    }
    icon.isTemplate = true
    return icon
}
