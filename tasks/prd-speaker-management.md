# PRD: Speaker Management — Presenter Admin Console

## Introduction

Add a full-page presenter admin console to the Chrome extension. The presenter (admin) gets a dedicated manager page where they can enable/disable individual speakers, ping them with timed cues ("you're up" / "heads up"), run a global session timer visible to all participants, and run per-speaker slot timers to keep each section on time.

The extension popup stays lightweight. The manager page opens as a full browser tab from the popup, backed by the existing background service worker WebSocket connection — no new roles or conflicting connections.

---

## Goals

- Give the presenter live control over which speakers can advance slides at any moment
- Let the presenter send non-verbal cues to individual speakers without interrupting the session
- Surface a global timer to all participants so everyone stays on schedule
- Let the presenter track per-speaker time budgets live during the session
- Keep the architecture clean: one WebSocket, one `presenter` role, manager page communicates via `chrome.runtime` messaging

---

## User Stories

### US-001: Add manager page shell to extension
**Description:** As a developer, I need a full-tab extension page wired to background state so the presenter admin console has a foundation to build on.

**Acceptance Criteria:**
- [ ] `manager.html` and `src/manager.tsx` added to extension
- [ ] Entry added to `vite.config.ts` rollupOptions input
- [ ] Page renders with dark theme matching extension style
- [ ] Page subscribes to background state via `chrome.runtime.onMessage` and displays current session code + speaker list
- [ ] Typecheck passes

### US-002: "Open manager" button in popup
**Description:** As a presenter, I want to open the full manager console from the popup so I don't have to navigate there manually.

**Acceptance Criteria:**
- [ ] When session is connected, popup shows an "Open manager" button below the session code
- [ ] Clicking it calls `chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') })`
- [ ] If manager tab is already open, it is focused instead of opening a duplicate (use `chrome.tabs.query` to check)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Add `enabled` state to server speaker tracking
**Description:** As a developer, I need the server to track whether each speaker is enabled or disabled and enforce it on commands.

**Acceptance Criteria:**
- [ ] `Speaker` type in `sessions.ts` gains an `enabled: boolean` field (default `true`)
- [ ] New `ClientMessage` type: `{ type: 'speaker_status'; targetId: string; enabled: boolean }`
- [ ] Server handles `speaker_status` message: finds speaker by `targetId`, sets `enabled`, sends `{ type: 'your_status', enabled }` to that speaker's socket
- [ ] When server receives a `command` message from a speaker whose `enabled` is `false`, the command is silently dropped (not forwarded to presenter)
- [ ] Typecheck passes

### US-004: Speaker enable/disable controls in manager page
**Description:** As a presenter, I want to enable or disable individual speakers so only the current speaker can advance slides.

**Acceptance Criteria:**
- [ ] Manager page shows each connected speaker with a toggle (enabled = green, disabled = gray)
- [ ] Toggling sends `{ type: 'speaker_status', targetId, enabled }` to background via `chrome.runtime.sendMessage`
- [ ] Background forwards the message over WebSocket
- [ ] Toggle state reflects live background state (re-renders on `chrome.runtime.onMessage` updates)
- [ ] Newly joined speakers default to enabled
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Disabled state on speaker page
**Description:** As a speaker, I want to see clearly when I'm not allowed to advance slides so I'm not confused why nothing is happening.

**Acceptance Criteria:**
- [ ] When `your_status` message arrives with `enabled: false`, speaker page shows a banner: "Waiting for your turn…" and both Next/Prev buttons are visually disabled (opacity + `disabled` attribute)
- [ ] When `your_status` arrives with `enabled: true`, banner disappears and buttons re-enable
- [ ] `your_status` is handled in `useSession` hook and exposed as an `enabled` boolean
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Ping speakers from manager page
**Description:** As a presenter, I want to send a non-verbal cue to a specific speaker so they know when they're up or nearly up without me having to say anything.

**Acceptance Criteria:**
- [ ] New `ClientMessage` type: `{ type: 'ping'; targetId: string; pingType: 'up' | 'warning' }`
- [ ] New `ServerMessage` type: `{ type: 'ping'; pingType: 'up' | 'warning' }`
- [ ] Server routes incoming `ping` from presenter to the target speaker's socket
- [ ] Manager page shows two ping buttons per speaker: "You're up" (green) and "Heads up" (yellow)
- [ ] Buttons are disabled if the speaker is not connected
- [ ] Typecheck passes

### US-007: Ping display on speaker page
**Description:** As a speaker, I want a hard-to-miss visual cue when I'm pinged so I know to get ready without looking at chat.

**Acceptance Criteria:**
- [ ] "You're up" ping (`pingType: 'up'`): full-screen green overlay with bold "You're up!" text, auto-dismisses after 3 seconds, triggers `navigator.vibrate([200, 100, 200])` if available
- [ ] "Heads up" ping (`pingType: 'warning'`): amber banner at top of page with "Heads up — you're almost up", auto-dismisses after 5 seconds, triggers `navigator.vibrate([100])` if available
- [ ] Ping overlay/banner is dismissible by tapping
- [ ] Multiple rapid pings replace the previous (don't stack)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Global session timer on manager page
**Description:** As a presenter, I want a global timer I can start/pause/reset during the session so everyone stays on track.

**Acceptance Criteria:**
- [ ] Manager page has a global timer section with: duration input (minutes), Start, Pause, Reset controls
- [ ] Timer counts down; when it hits 0:00 it stops and shows a visual alert on the manager page
- [ ] Timer state lives in the manager page (client-side); no server persistence needed
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Broadcast global timer to all participants
**Description:** As a presenter, I want all speakers to see the global timer so everyone shares the same sense of time remaining.

**Acceptance Criteria:**
- [ ] New `ClientMessage` type: `{ type: 'timer_sync'; timerType: 'global'; action: 'start' | 'pause' | 'reset'; remainingMs: number }`
- [ ] New `ServerMessage` type matching the above (server broadcasts to all participants including presenter)
- [ ] Server broadcasts `timer_sync` (global) to all sockets in the session
- [ ] Manager page sends `timer_sync` on start/pause/reset
- [ ] Speaker page displays global timer in the header (small, non-intrusive) when active; hidden when not started or reset
- [ ] Timer on speaker page runs locally after receiving `start` sync — no per-tick server messages
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Per-speaker slot timers on manager page
**Description:** As a presenter, I want to start a countdown for each speaker's slot so I can track how long each section is running.

**Acceptance Criteria:**
- [ ] Each speaker row in the manager page has: duration input (minutes), Start, Pause, Reset controls
- [ ] Multiple speaker timers can run simultaneously
- [ ] When a speaker's timer hits 0:00, their row flashes red on the manager page
- [ ] Per-speaker timer state is local to the manager page (not broadcast unless US-011 is added)
- [ ] Timers can be enabled/disabled per speaker (checkbox or toggle to hide the timer row)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Broadcast per-speaker timer to that speaker
**Description:** As a speaker, I want to see my own slot countdown on my device so I can manage my own pacing.

**Acceptance Criteria:**
- [ ] New `ClientMessage` type: `{ type: 'timer_sync'; timerType: 'speaker'; targetId: string; action: 'start' | 'pause' | 'reset'; remainingMs: number }`
- [ ] Server routes speaker timer sync only to the target speaker (not broadcast)
- [ ] Speaker page shows their own slot timer prominently (below the Next button) when active
- [ ] Timer runs locally on speaker device after receiving `start` sync
- [ ] Timer shows warning color (amber) when under 1 minute remaining
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Show speaker's local wall clock time on speaker page
**Description:** As a speaker in any timezone, I want to see my local time on the speaker page so I have personal time context during the session without alt-tabbing.

**Acceptance Criteria:**
- [ ] Speaker page (ready state) displays the speaker's local time in the header, updating every second
- [ ] Time is formatted using `toLocaleTimeString()` with no arguments so it respects the speaker's browser locale and timezone automatically — no manual timezone handling needed
- [ ] Time display is subtle (same muted style as session code / speaker count) so it doesn't compete with the Next/Prev buttons
- [ ] No server involvement — purely client-side `Date` rendering
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- FR-1: Manager page opens as a full browser tab via `chrome.tabs.create`; only one instance opens at a time
- FR-2: Manager page receives live session state from background SW via `chrome.runtime.onMessage`; all commands sent via `chrome.runtime.sendMessage`
- FR-3: `Speaker` type gains `enabled: boolean` (default `true`); server drops `command` messages from disabled speakers
- FR-4: `speaker_status` message is only accepted from the `presenter` socket; server ignores it from speakers
- FR-5: `ping` message is only accepted from the `presenter` socket; server routes to target speaker by `targetId`
- FR-6: `timer_sync` with `timerType: 'global'` is broadcast to all session participants
- FR-7: `timer_sync` with `timerType: 'speaker'` is routed only to the named `targetId`
- FR-8: Timer accuracy is client-side only; no server tick messages — server only relays start/pause/reset events with `remainingMs` as a snapshot; each client runs its own interval anchored to `Date.now()`
- FR-11: Countdown timers are timezone-agnostic by design (duration-based, not wall-clock); no timezone conversion is needed for timer sync
- FR-12: Speaker page displays the speaker's local wall clock time using `toLocaleTimeString()` — no timezone data is sent over the wire
- FR-9: Vibration on ping uses `navigator.vibrate()` with graceful no-op if unavailable (e.g. desktop)
- FR-10: All new message types added to `packages/types/src/index.ts` so server and clients share them

---

## Non-Goals

- No persistent timer history or session replay
- No speaker-initiated timer controls (timers are presenter-only)
- No automatic enable/disable based on slide number (that's a future feature tied to speaker notes parsing)
- No audio cues (vibration only for pings)
- No authentication or roles beyond the existing `presenter` / `speaker` distinction
- No UI in the extension popup for speaker management (popup stays simple)

---

## Design Considerations

- Manager page layout: header (session code, copy link, end session) → global timer section → speaker roster (each row: name, enabled toggle, ping buttons, slot timer)
- Speaker rows should visually indicate connected vs. disconnected state (dim disconnected speakers)
- Global timer: large, centered clock display; subtle on speaker page (header corner)
- Per-speaker timer: shown inline in the speaker's row on manager; shown prominently on the speaker's own device
- Ping overlays on speaker page must work well on mobile (full-width, large text, tap-to-dismiss)
- Reuse existing ShadCN components: `Button`, `Input`, `Badge`; add `Switch` for enable/disable toggle

---

## Technical Considerations

- **No new WS roles needed** — manager page communicates through background SW, which holds the single `presenter` socket
- **Message routing on server** — `ping` and `speaker timer_sync` require looking up a speaker socket by `targetId`; use `session.speakers.get(targetId)`
- **Manager page state** — subscribe with `chrome.runtime.onMessage`; also call `chrome.runtime.sendMessage({ type: 'getState' })` on mount to get initial state (same pattern as popup)
- **Timer drift** — use `Date.now()` anchoring (`startedAt + duration - Date.now()`) rather than decrementing a counter in `setInterval` to avoid drift
- **`manifest.json`** — no changes needed; manager page is a regular extension page accessible via `chrome.runtime.getURL('manager.html')`
- **New files**: `manager.html`, `src/manager.tsx`; update `vite.config.ts` to add `manager` entry

---

## Success Metrics

- Presenter can enable/disable a speaker in one click from the manager page
- Ping reaches speaker device in under 500ms (WebSocket round-trip)
- Global timer stays within ±1 second across all connected devices over a 30-minute session
- Manager page opens in under 1 second from popup button click

---

## Open Questions

- Should newly joined speakers default to **disabled** (presenter must explicitly enable them) rather than enabled? This would give more control in structured sessions but adds friction.
- Should the manager page show a "who has slide control right now" indicator more prominently, separate from the enable/disable toggles?
- When the manager tab is closed and reopened mid-session, timer state is lost (it's local). Should we persist timer state to `chrome.storage.session` so it survives tab closes?
