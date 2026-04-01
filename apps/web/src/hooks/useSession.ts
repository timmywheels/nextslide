import { useEffect, useRef, useState, useCallback } from 'react'
import type { ClientMessage, Participant, ServerMessage, SlideCommand } from '@nextslide/types'

type Role = 'presenter' | 'speaker'

export interface TimerSync {
  action: 'start' | 'pause' | 'reset'
  remainingMs: number
  syncedAt: number  // Date.now() when received — used to account for elapsed time
}

interface UseSessionResult {
  connected: boolean
  participantCount: number
  participants: Participant[]
  presenterConnected: boolean
  speakerEnabled: boolean
  globalTimerSync: TimerSync | null
  speakerTimerSync: TimerSync | null
  sendCommand: (command: SlideCommand) => void
}

function getWsUrl(code: string): string {
  const { protocol, host } = window.location
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${host}/ws/${code}`
}

function getOrCreateClientId(): string {
  const key = 'nextslide_client_id'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = Math.random().toString(36).slice(2, 10)
  sessionStorage.setItem(key, id)
  return id
}

export function useSession(
  code: string,
  role: Role,
  name?: string,
  onCue?: (cueType: 'up' | 'warning') => void,
): UseSessionResult {
  const [connected, setConnected] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [presenterConnected, setPresenterConnected] = useState(false)
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [globalTimerSync, setGlobalTimerSync] = useState<TimerSync | null>(null)
  const [speakerTimerSync, setSpeakerTimerSync] = useState<TimerSync | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  const onCueRef = useRef(onCue)
  onCueRef.current = onCue

  const send = useCallback((msg: ClientMessage): void => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  const sendCommand = useCallback(
    (command: SlideCommand): void => {
      send({ type: 'command', command })
    },
    [send],
  )

  useEffect(() => {
    unmountedRef.current = false

    function connect(): void {
      if (unmountedRef.current) return

      const ws = new WebSocket(getWsUrl(code))
      wsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return }
        setConnected(true)
        const clientId = role === 'speaker' ? getOrCreateClientId() : undefined
        const joinMsg: ClientMessage = { type: 'join', role, ...(name ? { name } : {}), ...(clientId ? { clientId } : {}) }
        ws.send(JSON.stringify(joinMsg))
      }

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(event.data) as ServerMessage
        } catch { return }

        if (msg.type === 'joined' || msg.type === 'participant_update') {
          const count = msg.type === 'joined' ? msg.participantCount : msg.count
          setParticipantCount(count)
          setParticipants(msg.participants)
          if (role === 'speaker') {
            setPresenterConnected(msg.participants.some(p => p.role === 'presenter'))
            // Sync enabled state from participant list on reconnect
            const self = msg.participants.find(p => p.role === 'speaker' && p.name === name)
            if (self?.enabled !== undefined) setSpeakerEnabled(self.enabled)
          } else {
            setPresenterConnected(true)
          }
        } else if (msg.type === 'your_status') {
          setSpeakerEnabled(msg.enabled)
        } else if (msg.type === 'cue') {
          onCueRef.current?.(msg.cueType)
        } else if (msg.type === 'timer_sync') {
          const sync: TimerSync = { action: msg.action, remainingMs: msg.remainingMs, syncedAt: Date.now() }
          if (msg.timerType === 'global') {
            setGlobalTimerSync(sync)
          } else {
            setSpeakerTimerSync(sync)
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' } satisfies ClientMessage))
        } else if (msg.type === 'error' && msg.message === 'no_presenter') {
          setPresenterConnected(false)
        }
      }

      ws.onclose = () => {
        if (wsRef.current !== ws) return
        setConnected(false)
        wsRef.current = null
        if (!unmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => { ws.close() }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) ws.close()
    }
  }, [code, role, name])

  return { connected, participantCount, participants, presenterConnected, speakerEnabled, globalTimerSync, speakerTimerSync, sendCommand }
}
