import type { ClientMessage, Participant, ServerMessage, SlideCommand } from '@nextslide/types'

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL as string ?? 'wss://nextslide.app'
const MAX_BACKOFF_MS = 30_000

// ── WebSocket state ────────────────────────────────────────────────────────

let socket: WebSocket | null = null
let currentCode: string | null = null
let currentName: string | undefined
let currentRelayUrl = DEFAULT_RELAY_URL
let connected = false
let participants: Participant[] = []
let backoffMs = 1_000
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ── push state to popup ────────────────────────────────────────────────────

function pushState(error?: string): void {
  chrome.runtime.sendMessage({
    connected, code: currentCode, participants, error: error ?? null,
  }).catch(() => {})
}

// ── slides control ─────────────────────────────────────────────────────────

function sendToSlides(command: SlideCommand): void {
  chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { command }).catch(() => {})
      }
    }
  })
}

// ── keepalive: send a message every 20s so Chrome doesn't suspend the SW ──
// https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets

function keepAlive(): void {
  const id = setInterval(() => {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'pong' } satisfies ClientMessage))
    } else {
      clearInterval(id)
    }
  }, 20_000)
}

// ── connection logic ───────────────────────────────────────────────────────

function doDisconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (socket) { socket.onclose = null; socket.close(); socket = null }
  connected = false; currentCode = null; participants = []; backoffMs = 1_000
  void chrome.storage.local.set({ activeCode: null, lastCode: null })
  pushState()
}

function doConnect(code: string, relayUrl: string, name?: string): void {
  if (socket) doDisconnect()
  currentCode = code; currentRelayUrl = relayUrl; currentName = name
  void chrome.storage.local.set({ activeCode: code })

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
    keepAlive()
  }

  ws.onmessage = ({ data }) => {
    let msg: ServerMessage
    try { msg = JSON.parse(data as string) as ServerMessage } catch { return }

    if (msg.type === 'joined') {
      connected = true; backoffMs = 1_000; participants = msg.participants; pushState()
    } else if (msg.type === 'participant_update') {
      participants = msg.participants; pushState()
    } else if (msg.type === 'command') {
      sendToSlides(msg.command)
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' } satisfies ClientMessage))
    } else if (msg.type === 'error') {
      connected = false; pushState(msg.message)
      // These errors mean the session is gone — stop reconnecting
      if (msg.message === 'presenter_already_connected' || msg.message === 'session_not_found') {
        doDisconnect()
      }
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

// ── startup: resume prior session ─────────────────────────────────────────

void (async () => {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(['activeCode']),
    chrome.storage.sync.get(['relayUrl']),
  ])
  currentRelayUrl = (sync.relayUrl as string | undefined) ?? DEFAULT_RELAY_URL
  const activeCode = local.activeCode as string | undefined
  if (activeCode) doConnect(activeCode, currentRelayUrl)
})()

// ── message hub ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'getState') {
    sendResponse({ connected, code: currentCode, participants })
    return true
  }
  if (message.type === 'connect') {
    const relayUrl = (message.relayUrl as string | undefined) ?? currentRelayUrl
    void chrome.storage.sync.set({ relayUrl })
    doConnect(message.code as string, relayUrl, message.name as string | undefined)
    sendResponse({ ok: true })
    return true
  }
  if (message.type === 'startSession') {
    const relayUrl = (message.relayUrl as string | undefined) ?? currentRelayUrl
    void chrome.storage.sync.set({ relayUrl })
    const apiUrl = relayUrl.replace(/^ws(s?):\/\//, 'http$1://')
    fetch(`${apiUrl}/api/sessions`, { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: { code: string }) => {
        doConnect(data.code, relayUrl, message.name as string | undefined)
        sendResponse({ code: data.code })
      })
      .catch(err => sendResponse({ error: String(err) }))
    return true
  }
  if (message.type === 'disconnect') {
    doDisconnect()
    sendResponse({ ok: true })
    return true
  }
  // Manager page forwards: speaker_status, cue, timer_sync
  if (message.type === 'speaker_status' || message.type === 'cue' || message.type === 'timer_sync') {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message))
    }
    sendResponse({ ok: true })
    return true
  }
  return false
})
