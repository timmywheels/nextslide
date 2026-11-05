# nextslide

> Remote slide controls for presenters.

Nextslide lets speakers control a host’s presentation. The host runs a macOS menu bar app; speakers join in their browser and need no installation or Nextslide account.

## macOS menu bar app

**Download:** grab `Nextslide-<version>.zip` from the [latest release](https://github.com/timmywheels/nextslide/releases/latest), unzip, and drag `Nextslide.app` to Applications. The app is signed with an Apple Developer ID and notarized, so it opens without Gatekeeper warnings on macOS 14 or later. Google Chrome must be installed.

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

The Worker serves `nextslide.app` and `www.nextslide.app` as custom domains (DNS records are managed by the Worker) plus `nextslide.timwheeler.workers.dev`. It serves only static files; the legacy relay below is a separate service.

## Legacy extension workflow

The original Nextslide was a Chrome extension plus a relay server. It still works and is kept for self-hosters, but the menu bar app above is the recommended path.

The presenter installs a Chrome extension. When they start a session, the extension generates a 6-character code and connects to a relay server. Speakers visit the session URL on their phones, enter the code, and get a single **Next** / **Prev** button. Tapping it sends a command through the relay to the extension, which dispatches a keypress to the active Google Slides presentation.

```
Phone → WebSocket → Relay server → WebSocket → Chrome extension → Google Slides
```

The relay is a pure message forwarder. It holds no user data, no slide content, and no persistent state — sessions live in memory and expire after 4 hours of inactivity. When the presenter disconnects, the session is gone.

## Self-hosting the legacy workflow

### Option A — Railway (one click)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/new/template)

Or manually:

1. Fork this repo
2. Create a new Railway project → **Deploy from GitHub repo** → select your fork
3. Railway detects `railway.toml` and builds the single Docker image automatically
4. Add a custom domain in **Settings → Networking → Custom Domain**
5. Build and load the Chrome extension pointing at your domain (see [Extension](#extension) below)

The server handles both the API and the web app from a single service — no separate web deployment needed.

### Option B — Docker Compose (VPS / local)

```bash
git clone https://github.com/timmywheels/nextslide
cd nextslide
pnpm install

# Start server + web app
docker compose up
```

| Service | Port | URL |
|---------|------|-----|
| Relay server | 4545 | `http://localhost:4545` |
| Web app | 5757 | `http://localhost:5757` |

### Configuration

Environment variables for the server (set in Railway dashboard or `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the server listens on (Railway sets this automatically) |
| `CORS_ORIGIN` | `*` | Allowed origin for CORS. Set to your web app domain in production, e.g. `https://nextslide.app` |
| `SESSION_TTL_HOURS` | `4` | How long inactive sessions are kept in memory |
| `MAX_SESSIONS` | `1000` | Max concurrent sessions |
| `LOG_LEVEL` | `info` | Fastify log level (`silent`, `info`, `debug`) |

### Extension

Build a production extension bundle pointed at your self-hosted domain:

```bash
# Set your server's WebSocket URL in apps/extension/.env.production
VITE_RELAY_URL=wss://your-domain.com
VITE_WEB_URL=https://your-domain.com

# Build
pnpm --filter @nextslide/extension build
```

Then in Chrome: go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension/dist`.

To submit to the Chrome Web Store, zip the `dist/` folder and upload it in the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Stack

| Layer | Tech |
|-------|------|
| macOS app | SwiftUI + AppKit, SwiftNIO, bundled cloudflared |
| Web app | React + Tailwind + ShadCN, deployed to Cloudflare Workers |
| Relay server (legacy) | Fastify + `@fastify/websocket` |
| Extension (legacy) | Chrome MV3 (service worker + content script) |
| Shared types | TypeScript package (`@nextslide/types`) |
| Monorepo | pnpm workspaces |

## Why stateless?

Most "remote clicker" tools require OAuth, an account, or a third-party integration. The legacy relay keeps session state only in memory. The relay server is a switchboard — it connects a presenter to their audience and gets out of the way. You can audit exactly what it does in `apps/server/src/ws.ts` in about 150 lines.

This also makes self-hosting trivial. There is no database to provision, no credentials to rotate, and no data residency concern. Run it on a $5 VPS or inside a corporate network where phones and laptops share the same WiFi.

## License

MIT
