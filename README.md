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

```bash
# Clone and install
git clone https://github.com/your-org/nextslide
cd nextslide
pnpm install

# Start everything
docker compose up
```

The relay server runs on port `4545`. The web app runs on port `5757`. Load the `apps/extension/dist` folder as an unpacked Chrome extension.

To build the extension:

```bash
pnpm --filter @nextslide/extension build
```

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
