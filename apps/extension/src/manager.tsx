import './index.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import type { Participant } from '@nextslide/types'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

const WEB_URL = (import.meta.env.VITE_WEB_URL as string | undefined) ?? 'https://nextslide.app'

interface BackgroundState {
  connected: boolean
  code: string | null
  participants: Participant[]
  error?: string | null
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

interface TimerState {
  durationMinutes: number
  targetMs: number | null  // absolute ms when timer ends (while running)
  snapshotMs: number       // remaining ms captured at last pause/reset
  running: boolean
}

function initialTimer(minutes: number): TimerState {
  return { durationMinutes: minutes, targetMs: null, snapshotMs: minutes * 60_000, running: false }
}

function getDisplayMs(t: TimerState): number {
  if (t.running && t.targetMs !== null) return Math.max(0, t.targetMs - Date.now())
  return t.snapshotMs
}

function formatMs(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface TimerProps {
  timer: TimerState
  onChange: (t: TimerState) => void
  onSync?: (action: 'start' | 'pause' | 'reset', remainingMs: number) => void
}

function Timer({ timer, onChange, onSync }: TimerProps): React.ReactElement {
  const [, setTick] = React.useState(0)
  const timerRef = React.useRef(timer)
  const onChangeRef = React.useRef(onChange)
  timerRef.current = timer
  onChangeRef.current = onChange

  React.useEffect(() => {
    if (!timer.running) return
    const id = setInterval(() => {
      const t = timerRef.current
      if (!t.running || t.targetMs === null) return
      const ms = Math.max(0, t.targetMs - Date.now())
      if (ms === 0) {
        onChangeRef.current({ ...t, running: false, snapshotMs: 0, targetMs: null })
      } else {
        setTick(n => n + 1)
      }
    }, 250)
    return () => clearInterval(id)
  }, [timer.running])

  const displayMs = getDisplayMs(timer)
  const isExpired = displayMs === 0 && !timer.running && timer.snapshotMs === 0
  const isWarning = displayMs > 0 && displayMs < 60_000

  function handleStart(): void {
    const remaining = timer.snapshotMs
    const updated: TimerState = { ...timer, targetMs: Date.now() + remaining, running: true }
    onChange(updated)
    onSync?.('start', remaining)
  }

  function handlePause(): void {
    const remaining = getDisplayMs(timer)
    const updated: TimerState = { ...timer, targetMs: null, snapshotMs: remaining, running: false }
    onChange(updated)
    onSync?.('pause', remaining)
  }

  function handleReset(): void {
    const durationMs = timer.durationMinutes * 60_000
    const updated: TimerState = { ...timer, targetMs: null, snapshotMs: durationMs, running: false }
    onChange(updated)
    onSync?.('reset', durationMs)
  }

  function handleDurationChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const mins = Math.max(1, Math.min(999, parseInt(e.target.value) || 1))
    onChange({ ...timer, durationMinutes: mins, snapshotMs: mins * 60_000, targetMs: null, running: false })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        type="number"
        min={1}
        max={999}
        value={timer.durationMinutes}
        onChange={handleDurationChange}
        disabled={timer.running}
        className="w-16 text-center font-mono h-7 text-xs"
      />
      <span className="text-[10px] text-[#52525b]">min</span>
      <span className={`font-mono text-base font-bold w-12 text-right tabular-nums ${
        isExpired ? 'text-red-500' : isWarning ? 'text-amber-400' : 'text-white'
      }`}>
        {formatMs(displayMs)}
      </span>
      {timer.running ? (
        <Button size="sm" variant="outline" onClick={handlePause}
          className="h-7 px-3 text-xs">
          Pause
        </Button>
      ) : (
        <Button size="sm" variant="green" onClick={handleStart}
          disabled={isExpired}
          className="h-7 px-3 text-xs">
          Start
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={handleReset}
        className="h-7 px-3 text-xs text-[#52525b] hover:text-white">
        Reset
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Speaker row
// ---------------------------------------------------------------------------

interface SpeakerRowProps {
  participant: Participant
  slotTimer: TimerState
  onSlotTimerChange: (t: TimerState) => void
  onSlotTimerSync: (action: 'start' | 'pause' | 'reset', remainingMs: number) => void
}

function SpeakerRow({ participant, slotTimer, onSlotTimerChange, onSlotTimerSync }: SpeakerRowProps): React.ReactElement {
  const enabled = participant.enabled !== false

  function toggleEnabled(): void {
    chrome.runtime.sendMessage({ type: 'speaker_status', targetId: participant.id, enabled: !enabled })
  }

  function sendCue(cueType: 'up' | 'warning'): void {
    chrome.runtime.sendMessage({ type: 'cue', targetId: participant.id, cueType })
  }

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#111111] px-4 py-3 flex flex-col gap-3">
      {/* Name + controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${enabled ? 'bg-[#22c55e]' : 'bg-[#3f3f46]'}`} />
          <span className="text-sm font-medium text-white truncate">{participant.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleEnabled}
            className={`h-7 px-3 text-xs border ${
              enabled
                ? 'border-[#22c55e]/50 text-[#22c55e] hover:bg-[#22c55e]/10'
                : 'border-[#3f3f46] text-[#52525b] hover:border-white hover:text-white'
            }`}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => sendCue('up')}
            className="h-7 px-3 text-xs border border-[#166534] text-[#22c55e] hover:bg-[#14532d]"
          >
            You&apos;re up
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => sendCue('warning')}
            className="h-7 px-3 text-xs border border-[#92400e] text-amber-400 hover:bg-amber-950/40"
          >
            Heads up
          </Button>
        </div>
      </div>

      {/* Slot timer */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-[#3f3f46] w-7 shrink-0">Slot</span>
        <Timer timer={slotTimer} onChange={onSlotTimerChange} onSync={onSlotTimerSync} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function ManagerApp(): React.ReactElement {
  const [bgState, setBgState] = React.useState<BackgroundState | null>(null)
  const [globalTimer, setGlobalTimer] = React.useState<TimerState>(() => initialTimer(60))
  const [slotTimers, setSlotTimers] = React.useState<Record<string, TimerState>>({})
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    chrome.runtime.sendMessage({ type: 'getState' }, (response: BackgroundState) => {
      setBgState(response ?? { connected: false, code: null, participants: [] })
    })
    const listener = (message: BackgroundState): void => { setBgState(message) }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // Seed slot timers for new speakers (preserve existing timers on reconnect)
  React.useEffect(() => {
    const speakers = bgState?.participants.filter(p => p.role === 'speaker') ?? []
    if (speakers.length === 0) return
    setSlotTimers(prev => {
      const next = { ...prev }
      for (const s of speakers) {
        if (!next[s.id]) next[s.id] = initialTimer(10)
      }
      return next
    })
  }, [bgState?.participants])

  function syncGlobal(action: 'start' | 'pause' | 'reset', remainingMs: number): void {
    chrome.runtime.sendMessage({ type: 'timer_sync', timerType: 'global', action, remainingMs })
  }

  function syncSlot(targetId: string, action: 'start' | 'pause' | 'reset', remainingMs: number): void {
    chrome.runtime.sendMessage({ type: 'timer_sync', timerType: 'speaker', targetId, action, remainingMs })
  }

  function copyLink(): void {
    const url = `${WEB_URL}/s/${bgState?.code ?? ''}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function endSession(): void {
    chrome.runtime.sendMessage({ type: 'disconnect' })
  }

  if (!bgState) {
    return (
      <div className="flex items-center justify-center h-40 text-[#52525b] text-sm">
        Loading…
      </div>
    )
  }

  if (!bgState.connected || !bgState.code) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
        <p className="text-[#52525b] text-sm">No active session.</p>
        <p className="text-[#3f3f46] text-xs">Start a session from the extension popup.</p>
      </div>
    )
  }

  const speakers = bgState.participants.filter(p => p.role === 'speaker')

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="font-mono text-2xl font-bold tracking-[0.2em] text-white">{bgState.code}</span>
          <span className="text-xs text-[#52525b]">{speakers.length} {speakers.length === 1 ? 'speaker' : 'speakers'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLink}
            className="border border-[#3f3f46] text-[#a1a1aa] text-xs hover:border-white hover:text-white">
            {copied ? 'Copied!' : 'Copy speaker link'}
          </Button>
          <Button variant="ghost" size="sm" onClick={endSession}
            className="border border-[#3f3f46] text-[#a1a1aa] text-xs hover:border-red-500 hover:text-red-400">
            End session
          </Button>
        </div>
      </div>

      {/* Global session timer */}
      <div className="rounded-lg border border-[#27272a] bg-[#111111] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-2">
          Session timer
        </div>
        <Timer timer={globalTimer} onChange={setGlobalTimer} onSync={syncGlobal} />
      </div>

      {/* Speakers */}
      <div className="flex flex-col gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b]">
          Speakers ({speakers.length})
        </div>
        {speakers.length === 0 ? (
          <p className="text-sm text-[#3f3f46] italic">No speakers connected yet.</p>
        ) : (
          speakers.map(p => (
            <SpeakerRow
              key={p.id}
              participant={p}
              slotTimer={slotTimers[p.id] ?? initialTimer(10)}
              onSlotTimerChange={t => setSlotTimers(prev => ({ ...prev, [p.id]: t }))}
              onSlotTimerSync={(action, remainingMs) => syncSlot(p.id, action, remainingMs)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const container = document.getElementById('root')!
createRoot(container).render(
  <div className="min-h-screen bg-[#0a0a0a] text-white">
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#52525b] uppercase mb-6">
        nextslide.app — session manager
      </div>
      <ManagerApp />
    </div>
  </div>
)
