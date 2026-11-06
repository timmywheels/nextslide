# Native macOS host

Nextslide is a SwiftUI and AppKit menu bar app. Speakers use a browser; they do not install an app or extension.

1. Paste a Google Slides link with Command-V, then choose **Open presentation**. Setup stays open when you switch to another window to copy the link.
2. Sign in to Google in the separate presentation window if prompted. Nextslide remembers that profile locally.
3. Choose **Create invite link**, then **Copy invite link** and send it to speakers.
4. Select **Allow** beside a speaker. This automatically pauses everyone else.
5. Use **Pause all** or **End session** when needed.

Speaker buttons show a 450 ms progress sweep after each press and prevent rapid repeat commands. Commands send immediately. Nextslide requests notification permission when you start a session; new speakers trigger a notification and a menu bar badge while the host panel is closed. Selecting the notification opens the speaker list. Reconnecting speakers do not trigger repeat alerts.

Right-click (or Control-click) the menu bar icon for quick access to the presentation, invite link, speaker controls, and Quit.

The Google Slides window can stay in the background while the host works in other windows, including another Chrome window. Share that presentation window in your meeting app. Keynote and PowerPoint are also available, with Accessibility permission; these alternatives currently require the slideshow app to stay in front.

## Build and run

Requires macOS 14 or later, a current Swift toolchain, Node, pnpm, Google Chrome, and cloudflared as a build dependency. Full Xcode is not required for the integration checks.

```sh
pnpm install
brew install cloudflared
pnpm package:desktop
pnpm start:local
```

The app bundle is written to `apps/macos/build/Nextslide.app`. It includes the Swift executable, browser remote, cloudflared, and the Sparkle framework. It does not contain Electron or Node. Google Chrome must be installed on the host.

## Signing and releases

Two signing modes are built into `scripts/package.mjs`:

| Command | Certificate | Hardened runtime | Notarized | Output |
|---------|-------------|------------------|-----------|--------|
| `pnpm package:desktop` | Persistent local development certificate | No | No | `build/Nextslide.app` |
| `pnpm release:desktop` | `Developer ID Application` from your login keychain | Yes | Required | `build/Nextslide.app`, `build/Nextslide.dmg`, `build/Nextslide-<version>.zip` |

The local development identity lives in `~/Library/Application Support/Nextslide/Signing`; preserve it across builds to retain macOS permission grants. It is not a distribution signature.

Release builds use the first `Developer ID Application` certificate found by `security find-identity`, or the identity named in `NEXTSLIDE_SIGNING_IDENTITY`. The hardened runtime is enabled with no entitlement exceptions: the app spawns Chrome and cloudflared as ordinary subprocesses, uses no JIT, and is not sandboxed. Accessibility and notification access are user grants, not entitlements. Switching from the local certificate to Developer ID changes the app's designated requirement, so macOS asks for those permissions again on the first release build.

Release builds are universal, so they run on Apple Silicon and Intel Macs. They replace the Homebrew `cloudflared` with a universal build of the version pinned in `scripts/package.mjs`, verified against Cloudflare's published SHA-256 hashes. They also bundle `libswiftCompatibilitySpan.dylib`, which macOS 14 and 15 do not include.

Notarization is automatic once credentials are stored in the keychain under the profile name `nextslide` (override with `NEXTSLIDE_NOTARY_PROFILE`). Store them once with an [app-specific password](https://support.apple.com/102654):

```sh
xcrun notarytool store-credentials nextslide --apple-id <your Apple ID> --team-id <your Team ID>
```

`pnpm release:desktop` then submits the zip, waits for the verdict, staples the ticket to the bundle, rebuilds the zip, and checks it with `spctl`. Without a profile the build stops with an error instead of producing a zip that Gatekeeper would block. It then builds, signs, notarizes, and staples `build/Nextslide.dmg`, signs the zip for Sparkle, and writes `apps/web/public/appcast.xml`.

To publish a release, bump `version` in `package.json`, then:

1. Run `pnpm release:desktop`.
2. Upload `build/Nextslide.dmg` and `build/Nextslide-<version>.zip` to a GitHub release tagged `v<version>`. Keep the disk image's name unchanged: the marketing site's download button links to it directly. Sparkle installs from the zip.
3. Run `pnpm deploy:web` to publish the appcast. Do this last, because the appcast points at the GitHub download.

## Updates

Release builds update themselves with [Sparkle](https://sparkle-project.org) from `https://nextslide.app/appcast.xml`. Sparkle checks about once a day and asks before installing. A scheduled update never interrupts an open presentation: it waits behind **Install update** in the host panel and the menu bar icon's right-click menu. Hosts can also right-click the icon and choose **Check for Updates…**. Development builds have no public key, so they never check for updates.

Updates are verified against `SUPublicEDKey` in `scripts/package.mjs`. The private key is in the login keychain as Sparkle account `nextslide`; `sign_update` reads it during the release. **Back it up:** existing installs reject updates signed by any other key. Export it with:

```sh
.build/artifacts/sparkle/Sparkle/bin/generate_keys --account nextslide -x nextslide-sparkle.key
```

Keep that file in a password manager, not in this repository.

The previous Electron implementation remains in `apps/desktop` as a reference and a shared protocol test harness. The default desktop commands now build and launch the native app.

## Connection and control

- SwiftNIO listens on an automatically allocated loopback port. Hosts do not choose or forward ports.
- A Cloudflare Quick Tunnel starts connecting while the presentation opens. Opening a deck and creating an invite share the same startup work. The app retries failed tunnel starts twice, writes failures to `~/Library/Logs/Nextslide/tunnel.log`, displays connection progress, and checks public reachability before offering the link; no speaker session exists until the host creates the invite.
- The invite token is in the URL fragment, separate from the host credential. Creating sessions and loading the private connection engine require a secret available only to the app.
- A hidden page in Nextslide’s dedicated Chrome runs the existing WebRTC connection and approval code. It is not an extension, requires no developer settings, and exposes no debugging port. A private inherited pipe connects it to Swift.
- Slide commands use WebRTC when possible, with authenticated WebSockets through the tunnel as fallback. Duplicate and expired commands are rejected; interrupted commands are never replayed automatically.
- The app targets the exact presentation and document context. It does not activate Chrome for remote commands or attach to the host’s regular Chrome profile.
- Ending a session invalidates its invite, disconnects speakers, and waits for the public tunnel process to exit. Startup cancellation and normal Quit also wait for cleanup; an unresponsive helper is force-terminated after two seconds. Sessions also expire after four hours; each supports up to 32 speakers, with one allowed at a time.

Google Slides does not expose an official slideshow-control API. Detection supports the current page-wrapper/SVG viewer and older viewer layouts, but changes to Google’s UI can require updates. The acknowledgment confirms command dispatch, not the completion of an animation or slide rendering.

Quick Tunnels use a temporary address and are intended for development. For distributed production use, replace this transport setup with a managed, stable tunnel service. The native UX does not expose network or service settings.

## Checks

```sh
pnpm test:macos
pnpm test
pnpm test:e2e
```

Native integration checks use a temporary, isolated headless Chrome profile and a fixture matching the current Google viewer structure. They cover session authentication, guest identity routing, invite invalidation, background control, duplicate suppression, exclusive speaker approval, sign-in/access states, and the actual browser remote sending a direct WebRTC command through the native bridge. TypeScript and Playwright checks cover the shared connection protocol, fallback, reconnect, and browser remote.

The native checks are a small executable (`NextslideChecks`) so they run with Apple’s command-line tools without requiring XCTest from full Xcode. It is not included in the app bundle.
