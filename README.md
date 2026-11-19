# nextslide

> Remote slide controls for presenters.

Nextslide lets speakers control a host’s presentation. The host runs a macOS menu bar app; speakers join in their browser and need no installation or Nextslide account.

## macOS menu bar app

**Download:** get [`Nextslide.dmg`](https://github.com/timmywheels/nextslide/releases/latest/download/Nextslide.dmg), open it, and drag Nextslide to Applications. The app is signed and notarized by Apple and updates itself with Sparkle. It requires macOS 14 or later and Google Chrome.

Paste a Google Slides link into the menu bar app to open a dedicated presentation window. No browser extension is needed. Click **Create invite link** and share its public HTTPS link. Speakers can join while the deck is still opening; slide controls wait until it is ready. Speakers join in their browser from any network. **Allow** gives one speaker control and automatically pauses everyone else.

Nextslide opens a separate Chrome presentation window and keeps control on that deck while the host uses other windows and apps. Sign into Google there when needed; its separate local profile remembers the login. The menu bar app automatically starts a local service and public Cloudflare tunnel; commands use WebRTC when possible and authenticated WebSockets as a fallback. Keynote and PowerPoint remain foreground keyboard-control alternatives. An acknowledgment confirms dispatch, not that a slide finished rendering.

### Build from source

```bash
pnpm install
brew install cloudflared # build dependency; bundled in the app
pnpm package:desktop  # macOS only; local development signature
pnpm start:local      # session startup opens its public tunnel automatically
```

The native SwiftUI/AppKit app bundle is generated in `apps/macos/build/Nextslide.app`. `pnpm package:desktop` signs with a persistent local development certificate; `pnpm release:desktop` signs with your Developer ID Application certificate, enables the hardened runtime, notarizes, and writes a distributable zip. Installation, networking, packaging, signing, and verification are covered in [the menu bar app README](apps/macos/README.md).

## Marketing site

`apps/web` is the public site at [nextslide.app](https://nextslide.app) and the browser remote speakers open. It is a static Vite build deployed to Cloudflare Workers as static assets (see `apps/web/wrangler.jsonc`).

```bash
pnpm deploy:web   # builds apps/web and runs wrangler deploy
```

The Worker is pinned to the owning Cloudflare account in `wrangler.jsonc`, so `wrangler login` must be authorized by that account. To keep a second Cloudflare login separate, point wrangler at its own config directory for both login and deploy:

```bash
XDG_CONFIG_HOME=~/.config/nextslide-wrangler pnpm --filter @nextslide/web exec wrangler login
XDG_CONFIG_HOME=~/.config/nextslide-wrangler pnpm deploy:web
```

The Worker serves `nextslide.app` and `www.nextslide.app` as custom domains (DNS records are managed by the Worker) plus `nextslide.timwheeler.workers.dev`. It serves only static files.

## Stack

| Layer | Tech |
|-------|------|
| macOS app | SwiftUI + AppKit, SwiftNIO, bundled cloudflared, Sparkle updates |
| Marketing site and speaker remote | React, deployed to Cloudflare Workers |
| Shared connection code | TypeScript package (`@nextslide/connection`) |
| Monorepo | pnpm workspaces |

## License

MIT
