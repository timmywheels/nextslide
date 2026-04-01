import type { ClientMessage, Participant, ServerMessage, SlideCommand } from '@nextslide/types'

// Keep this offscreen document alive for the extension's lifetime.
// WEB_RTC reason requires an active RTCPeerConnection to stay open indefinitely.
// Without this, Chrome closes the document when the SW goes idle (~30s).
const _keepAlive = new RTCPeerConnection()

const MAX_BACKOFF_MS = 30_000

let socket: WebSocket | null = null
let currentCode: string | null = null
let currentName: string | undefined
let currentRelayUrl: string | null = null
let connected = false
let participants: Participant[] = []
let backoffMs = 1_000
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ── messaging to background ────────────────────────────────────────────────

function pushState(error?: string): void {
  chrome.runtime.sendMessage({
    _from: 'offscreen', type: 'stateUpdate',
    connected, code: currentCode, participants, error: error ?? null,
  }).catch(() => {})
}

function pushSlideCommand(command: SlideCommand): void {
  chrome.runtime.sendMessage({ _from: 'offscreen', type: 'slideCommand', command }).catch(() => {})
}

function saveActiveCode(code: string | null): void {
  chrome.runtime.sendMessage({ _from: 'offscreen', type: 'saveActiveCode', code }).catch(() => {})
}

// ── connection logic ───────────────────────────────────────────────────────

function doDisconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (socket) { socket.onclose = null; socket.close(); socket = null }
  connected = false; currentCode = null; participants = []; backoffMs = 1_000
  saveActiveCode(null)
  pushState()
}

function doConnect(code: string, relayUrl: string, name?: string): void {
  if (socket) doDisconnect()
  currentCode = code; currentRelayUrl = relayUrl; currentName = name
  saveActiveCode(code)

  const wsUrl = `${relayUrl}/ws/${code}`
  let ws: WebSocket
  try { ws = new WebSocket(wsUrl) } catch (err) {
    pushState(`Failed to connect: ${String(err)}`)
    scheduleReconnect(code, relayUrl, name)
    return
  }
  socket = ws

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', role: 'presenter', ...(name ? { name } : {}) } satisfies ClientMessage))
  }

  ws.onmessage = ({ data }) => {
    let msg: ServerMessage
    try { msg = JSON.parse(data as string) as ServerMessage } catch { return }

    if (msg.type === 'joined') {
      connected = true; backoffMs = 1_000; participants = msg.participants; pushState()
    } else if (msg.type === 'participant_update') {
      participants = msg.participants; pushState()
    } else if (msg.type === 'command') {
      pushSlideCommand(msg.command)
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' } satisfies ClientMessage))
    } else if (msg.type === 'error') {
      connected = false; pushState(msg.message)
      if (msg.message === 'presenter_already_connected') doDisconnect()
    }
  }

  ws.onclose = () => {
    socket = null; connected = false; pushState()
    if (currentCode && currentRelayUrl) scheduleReconnect(currentCode, currentRelayUrl, currentName)
  }

  ws.onerror = () => pushState(`Cannot reach server at ${relayUrl} — is it running?`)
}

function scheduleReconnect(code: string, relayUrl: string, name?: string): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    doConnect(code, relayUrl, name)
  }, backoffMs)
}

// ── message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message._to !== 'offscreen') return false

  if (message.type === 'getState') {
    sendResponse({ connected, code: currentCode, participants })
    return true
  }
  if (message.type === 'init' && message.activeCode) {
    doConnect(message.activeCode as string, message.relayUrl as string)
    sendResponse({ ok: true })
    return true
  }
  if (message.type === 'connect') {
    doConnect(message.code as string, message.relayUrl as string, message.name as string | undefined)
    sendResponse({ ok: true })
    return true
  }
  if (message.type === 'startSession') {
    const apiUrl = (message.relayUrl as string).replace(/^ws(s?):\/\//, 'http$1://')
    fetch(`${apiUrl}/api/sessions`, { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: { code: string }) => {
        doConnect(data.code, message.relayUrl as string, message.name as string | undefined)
        sendResponse({ code: data.code })
      })
      .catch(err => sendResponse({ error: String(err) }))
    return true
  }
  if (message.type === 'disconnect') {
    doDisconnect(); sendResponse({ ok: true })
    return true
  }
  return false
})
