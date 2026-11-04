import AppKit
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
let green = NSColor(calibratedRed: 0.16, green: 0.275, blue: 0.196, alpha: 1)
green.setFill()
NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 216, yRadius: 216).fill()
let symbol = NSImage(systemSymbolName: "rectangle.on.rectangle.angled", accessibilityDescription: nil)!
    .withSymbolConfiguration(.init(pointSize: 512, weight: .regular))!
    .withSymbolConfiguration(.init(paletteColors: [.white]))!
symbol.draw(in: NSRect(x: 200, y: 208, width: 624, height: 608))
image.unlockFocus()
try NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
