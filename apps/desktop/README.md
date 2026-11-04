# Nextslide menu bar app

Paste a Google Slides link, open its presentation window, and create a speaker invite. Nextslide creates a public HTTPS invite and QR code. Speakers join in a browser from any network. **Allow** hands one speaker the clicker and immediately pauses every other speaker. **Pause** takes it back; ending the session invalidates the invite and stops the tunnel.

## Host experience

1. Paste a Google Slides link and click **Open presentation**.
2. Sign into Google in the dedicated Chrome presentation window if the deck requires it. Its login is kept in a separate local profile for next time.
3. Share that presentation window in your video call. Click **Create speaker invite** and share its public invite. Speakers can join before the slideshow is ready; their controls stay paused until it is detected.
4. Allow the current speaker. The host can use another app or their normal Chrome windows while that specific slideshow remains controllable.

There is no extension to install and Google Slides mode does not require Accessibility access. Chrome itself must be installed. The deck stays in Google Slides; Nextslide does not upload, convert, or publish it. The presentation profile is separate from the host's everyday Chrome profile, so the initial Google login is separate too. Company SSO and private-deck sign-in must be checked with the host's account; do not assume that a public-deck test verifies them.

Keynote and PowerPoint remain optional keyboard-control choices: they require Accessibility access and must stay in front.

## Build and run

Requires macOS, Node 22.12+, pnpm, Apple's Command Line Tools, and Homebrew's `cloudflared` package for building. The packaged app includes its runtime, local service, remote web UI, tunnel binary, and native helpers; users do not need Node or Homebrew to run the resulting app.

```bash
pnpm install
brew install cloudflared
pnpm package:desktop
pnpm start:local
```

Quit Nextslide before packaging. The output is `apps/desktop/build/Nextslide-darwin-arm64/Nextslide.app` (or `darwin-x64` on Intel). Open this bundle directly for subsequent use. No server or terminal needs to remain running.

The desktop build does not build or bundle a Chrome extension or native-messaging helper. On upgrade, the app removes its old native-messaging registration. The earlier standalone extension project is separate legacy code and is not part of the menu bar app.

## Public invites

Starting a session binds a local service to an OS-assigned free loopback port and launches the bundled `cloudflared` process. The app waits for the tunnel connection and public health check before showing the invite. It does not expose the Chrome bridge through HTTP. Anonymous callers cannot create host sessions: creation requires a separate random local-host secret. The desktop service serves only remote assets, authenticated desktop signaling/relay, and health checks; legacy unauthenticated extension endpoints are excluded.

WebRTC attempts direct delivery using STUN. Authenticated WebSockets through the public tunnel provide signaling and a fallback if direct connectivity fails. The host connects to its service over loopback. Approval and command validation run on the host for both transports. Commands are never automatically retried or replayed.

This development build uses Cloudflare Quick Tunnels. Their random hostname changes per session, and Cloudflare provides no uptime guarantee. Production events should use a named tunnel or a deployed Nextslide service; see [Cloudflare's Quick Tunnel limits](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). A deployed service can be entered in Settings or supplied with `NEXTSLIDE_SERVICE_URL`. Leave that setting blank for automatic public tunnels. The tunnel stops on End session, quit, lock, or sleep. A dead tunnel ends the session; it never silently rotates an active invite.

## Targeting and permissions

Nextslide launches installed Google Chrome with its own persistent profile at `~/Library/Application Support/Nextslide/Presentation Browser` and communicates over an inherited debugging pipe. No browser control port or bridge is exposed over HTTP or the public tunnel, and the host's normal Chrome profile is never attached, read, or copied. The app closes its own presentation browser on quit.

The selected target pins a window, Google deck ID, and unique document context. Only a visible Slides viewer inside that deck can receive an expiring Next/Previous event. Remote clicks never activate the window. Sign-in pages, closed windows, navigation to another deck, and non-presentation views stop control. Duplicate command IDs do not advance twice. Acknowledgment confirms dispatch, not a verified change in Google Slides' rendered slide.

Chrome mode does not require Accessibility access. Keyboard mode uses a persistent Swift helper and refreshes permission changes automatically. If an earlier unsigned/ad-hoc build appears enabled but remains blocked, use **Already enabled?** to locate the current app, remove the stale Accessibility entry with **−**, then add it with **+**. Toggling the stale entry may not replace its stored code requirement.

Local packages reuse a persistent development certificate in `~/Library/Application Support/Nextslide/Signing`. That directory is private (0700); its configuration is 0600 and the signing key is in a dedicated keychain that packaging locks afterward. Setup preserves the existing keychain search list and does not add a system-trusted root. Keep this directory between builds so TCC grants retain their certificate-anchored identity. Set `NEXTSLIDE_SIGNING_IDENTITY` to use an existing identity. Public distribution still needs Developer ID signing and notarization.

## Verification

```bash
pnpm build:desktop
pnpm typecheck
pnpm test
pnpm test:e2e
```

Tests launch a separate headless Chrome profile and cover real debugging-pipe delivery, persistent browser state, exact window/deck routing, and invalid target rejection; private session creation; cached Accessibility refresh; speaker approval and exclusive handoff; WebRTC delivery and authenticated relay fallback; background readiness; no replay after refresh; invite invalidation; and one key event reaching a background slideshow fixture without affecting another tab. Headless Chrome disables mDNS candidate anonymization only in tests. Live Google Slides behavior and networks remain separate from the fixture tests.
