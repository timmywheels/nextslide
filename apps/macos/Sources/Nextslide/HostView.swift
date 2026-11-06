import SwiftUI
import AppKit

private let accent = Color(red: 0.24, green: 0.39, blue: 0.28)
struct HostView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 9) {
                Image(systemName: "rectangle.on.rectangle.angled").font(.title3).foregroundStyle(accent).accessibilityHidden(true)
                Text("Nextslide").font(.system(size: 17, weight: .semibold))
                Spacer()
                if model.hosting { Label(model.connected ? "Session open" : "Reconnecting", systemImage: "circle.fill").font(.caption).foregroundStyle(model.connected ? accent : .secondary).labelStyle(.titleAndIcon) }
                Button { model.hide() } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Close panel").accessibilityLabel("Close panel")
            }.padding(.horizontal, 24).padding(.top, 22).padding(.bottom, 18)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !model.opened { setup } else { presentation; if model.hosting { session } else { invitation } }
                    if !model.error.isEmpty {
                        Label(model.error, systemImage: "exclamationmark.circle").font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("host-error")
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
            }
            Divider()
            HStack {
                if model.hosting || model.busy && model.busyLabel == "Creating invite…" {
                    Button { model.end() } label: {
                        Text(model.ending ? "Ending…" : "End session")
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(model.endHovered ? Color.primary.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 7))
                    }.disabled(model.ending).buttonStyle(.plain).foregroundStyle(.secondary)
                        .onHover { model.endHovered = $0 }
                } else { Text("Speakers join in their browser.").foregroundStyle(.secondary) }
                Spacer()
                if model.updateAvailable { Button("Install update") { model.onInstallUpdate() }.buttonStyle(.plain).foregroundStyle(accent) }
                Button { NSApplication.shared.terminate(nil) } label: { Image(systemName: "power") }.buttonStyle(.plain).help("Quit Nextslide").accessibilityLabel("Quit Nextslide")
            }.font(.caption).padding(.horizontal, 24).padding(.vertical, 17)
        }
        .frame(width: 404, height: model.hosting ? 660 : model.opened ? 550 : 470)
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(accent)
        .onExitCommand { model.hide() }
        .onChange(of: model.mode) { _, value in model.nativeApp = value == "Keynote" ? "com.apple.iWork.Keynote" : "com.microsoft.Powerpoint" }
    }
    private var setup: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Host a presentation").font(.system(size: 25, weight: .semibold))
            Text("Open your slides, then invite speakers to control them.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Picker("Presentation", selection: $model.mode) {
                Text("Google Slides").tag("Google Slides")
                Text("Keynote").tag("Keynote")
                Text("PowerPoint").tag("PowerPoint")
            }.pickerStyle(.menu).disabled(model.busy)
            if model.isGoogle {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Google Slides link").font(.callout.weight(.medium))
                    TextField("Paste a presentation link", text: $model.link).textFieldStyle(.roundedBorder).controlSize(.large).accessibilityLabel("Google Slides link").onSubmit { if !model.link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { model.openPresentation() } }
                }
                Text("Opens in a separate Chrome window. Sign in to Google there once. You can keep using your other windows.").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Open your slideshow in \(model.mode). It needs to stay in front while speakers control slides.").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            primary(model.busy ? model.busyLabel : model.isGoogle ? "Open presentation" : "Continue", busy: model.busy) { model.openPresentation() }.disabled(model.busy || model.isGoogle && model.link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
    private var presentation: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Image(systemName: "display").font(.title3).foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.status.title).font(.headline).lineLimit(2)
                    Label(model.status.ready ? "Presentation ready" : "Presentation needs attention", systemImage: model.status.ready ? "checkmark.circle.fill" : "exclamationmark.circle").font(.caption).foregroundStyle(model.status.ready ? accent : .orange)
                }
                Spacer(minLength: 0)
            }
            Text(model.status.message).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Show presentation") { model.showPresentation() }.disabled(model.busy)
                if !model.status.ready && model.isGoogle { Button("Reopen") { model.openPresentation() }.disabled(model.busy) }
                if model.needsAccess { Button("Allow access") { model.requestAccess() } }
                Spacer()
                if !model.hosting { Button("Change") { model.changePresentation() }.disabled(model.busy).buttonStyle(.link) }
            }.controlSize(.small)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }
    private var invitation: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Invite speakers").font(.title2.weight(.semibold))
            Text("Share a link with your speakers. They can join from any network, without installing an app.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            primary(model.busy ? model.busyLabel : "Create invite link", busy: model.busy) { model.createInvite() }.disabled(model.busy || model.ending)
            if !model.connectionState.message.isEmpty { Text(model.connectionState.message).font(.caption).foregroundStyle(.secondary) }
            if !model.status.ready { Text("Speakers can join while you finish opening the presentation.").font(.caption).foregroundStyle(.secondary) }
        }
    }
    private var session: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Invite speakers").font(.title2.weight(.semibold))
                HStack(spacing: 8) {
                    primary(model.copied ? "Link copied" : "Copy invite link", symbol: model.copied ? "checkmark" : "link") { model.copyInvite() }
                    Button { model.showQR.toggle() } label: { Image(systemName: "qrcode").font(.title2).frame(width: 36, height: 32) }.help("Show invite QR code").accessibilityLabel("Show invite QR code")
                        .popover(isPresented: $model.showQR) { VStack(spacing: 12) { if let image = qrCode(model.invite) { Image(nsImage: image).interpolation(.none).resizable().frame(width: 220, height: 220) }; Text("Scan to join this presentation").font(.callout) }.padding(24) }
                }
                Text("Send this link to each speaker.").font(.caption).foregroundStyle(.secondary)
            }
            Divider()
            HStack { Text("Speakers").font(.headline); Spacer(); if model.activeSpeaker != nil { Button("Pause all") { model.pause() }.controlSize(.small) } }
            if model.speakers.isEmpty {
                VStack(alignment: .leading, spacing: 5) { Text("No speakers connected").font(.callout.weight(.medium)); Text("When someone joins, select Allow to give them control.").font(.callout).foregroundStyle(.secondary) }.fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 14) {
                    ForEach(model.speakers) { speaker in
                        HStack(spacing: 12) {
                            ZStack { Circle().fill(accent.opacity(0.12)).frame(width: 34, height: 34); Text(String(speaker.name.prefix(1)).uppercased()).font(.callout.weight(.medium)).foregroundStyle(accent) }
                            VStack(alignment: .leading, spacing: 3) { Text(speaker.name).font(.callout.weight(.medium)).lineLimit(1); Text(!speaker.online ? "Disconnected" : speaker.enabled ? (model.status.ready ? "Has control" : "Waiting for presentation") : "Waiting").font(.caption).foregroundStyle(speaker.enabled && speaker.online ? accent : .secondary) }
                            Spacer()
                            Button(speaker.enabled ? "Pause" : "Allow") { model.allow(speaker) }.disabled(!speaker.online || !model.connected).controlSize(.regular)
                                .accessibilityLabel("\(speaker.enabled ? "Pause" : "Allow") \(speaker.name)")
                        }
                    }
                }
            }
            Text("Allowing one speaker pauses everyone else.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func primary(_ title: String, symbol: String? = nil, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) { HStack(spacing: 8) { if busy { ProgressView().controlSize(.small) }; if let symbol { Image(systemName: symbol) }; Text(title).fontWeight(.medium) }.frame(maxWidth: .infinity).frame(height: 31) }
            .buttonStyle(.borderedProminent).controlSize(.large)
    }
    private func qrCode(_ value: String) -> NSImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(value.utf8), forKey: "inputMessage")
        guard let output = filter.outputImage else { return nil }
        let rep = NSCIImageRep(ciImage: output); let image = NSImage(size: rep.size); image.addRepresentation(rep); return image
    }
}
