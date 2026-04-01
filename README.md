# nextslide

> Let your speakers advance your slides — no more "next slide, please."

nextslide is an open source tool that lets co-presenters control a speaker's Google Slides from their phone. No app to install, no Google OAuth, no accounts. Scan a code, tap next.

## How it works

The presenter installs a Chrome extension. When they start a session, the extension generates a 6-character code and connects to a relay server. Speakers visit the session URL on their phones, enter the code, and get a single **Next** / **Prev** button. Tapping it sends a command through the relay to the extension, which dispatches a keypress to the active Google Slides presentation.

```
Phone → WebSocket → Relay server → WebSocket → Chrome extension → Google Slides
```

The relay is a pure message forwarder. It holds no user data, no slide content, and no persistent state — sessions live in memory and expire after 4 hours of inactivity. When the presenter disconnects, the session is gone.

## Self-hosting

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
| Relay server | Fastify + `@fastify/websocket` |
| Web app | React + Tailwind + ShadCN |
| Extension | Chrome MV3 (service worker + content script) |
| Shared types | TypeScript package (`@nextslide/types`) |
| Monorepo | pnpm workspaces |

## Why stateless?

Most "remote clicker" tools require OAuth, an account, or a third-party integration. nextslide stores nothing. The relay server is a switchboard — it connects a presenter to their audience and gets out of the way. You can audit exactly what it does in `apps/server/src/ws.ts` in about 150 lines.

This also makes self-hosting trivial. There is no database to provision, no credentials to rotate, and no data residency concern. Run it on a $5 VPS or inside a corporate network where phones and laptops share the same WiFi.

## License

MIT
