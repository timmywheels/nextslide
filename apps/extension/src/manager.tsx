import './index.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import type { Participant } from '@nextslide/types'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

const WEB_URL = (import.meta.env.VITE_WEB_URL as string | undefined) ?? 'https://nextslide.app'
const TIMER_STORAGE_KEY = 'nextslide_manager_timers'

interface BackgroundState {
  connected: boolean
  code: string | null
  participants: Participant[]
  error?: string | null
}

// ---------------------------------------------------------------------------
// Timer state
// targetMs is absolute — survives tab refresh without adjustment.
// ---------------------------------------------------------------------------

interface TimerState {
  durationMs: number
  targetMs: number | null
  snapshotMs: number
  running: boolean
}

function initialTimer(minutes: number, seconds = 0): TimerState {
  const durationMs = (minutes * 60 + seconds) * 1_000
  return { durationMs, targetMs: null, snapshotMs: durationMs, running: false }
}

function getDisplayMs(t: TimerState): number {
  if (t.running && t.targetMs !== null) return Math.max(0, t.targetMs - Date.now())
  return t.snapshotMs
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}

const MILESTONES = [30_000, 10_000]

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }): React.ReactElement {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        enabled ? 'bg-primary' : 'bg-[#27272a]'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Timer component
// ---------------------------------------------------------------------------

interface TimerProps {
  timer: TimerState
  onChange: (t: TimerState) => void
  onSync?: (action: 'start' | 'pause' | 'reset', remainingMs: number) => void
  disabled?: boolean
}

function Timer({ timer, onChange, onSync, disabled = false }: TimerProps): React.ReactElement {
  const [flash, setFlash] = React.useState(false)
  const [, setTick] = React.useState(0)
  const timerRef = React.useRef(timer)
  const onChangeRef = React.useRef(onChange)
  const prevMsRef = React.useRef(getDisplayMs(timer))
  timerRef.current = timer
  onChangeRef.current = onChange

  React.useEffect(() => {
    if (!timer.running) return
    const id = setInterval(() => {
      const t = timerRef.current
      if (!t.running || t.targetMs === null) return
      const ms = Math.max(0, t.targetMs - Date.now())
      for (const m of MILESTONES) {
        if (prevMsRef.current > m && ms <= m) {
          setFlash(true)
          setTimeout(() => setFlash(false), 500)
        }
      }
      prevMsRef.current = ms
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

  const durationMins = Math.floor(timer.durationMs / 60_000)
  const durationSecs = Math.floor((timer.durationMs % 60_000) / 1_000)

  function handleDurationChange(mins: number, secs: number): void {
    const durationMs = (Math.max(0, mins) * 60 + Math.max(0, Math.min(59, secs))) * 1_000
    onChange({ ...timer, durationMs, snapshotMs: durationMs, targetMs: null, running: false })
  }

  function handleStart(): void {
    const remaining = timer.snapshotMs
    prevMsRef.current = remaining
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
    prevMsRef.current = timer.durationMs
    const updated: TimerState = { ...timer, targetMs: null, snapshotMs: timer.durationMs, running: false }
    onChange(updated)
    onSync?.('reset', timer.durationMs)
  }

  const countdownColor = disabled
    ? 'text-[#2a2a2a]'
    : flash ? 'text-white'
    : isExpired ? 'text-red-500'
    : isWarning ? 'text-amber-400'
    : 'text-[#a1a1aa]'

  return (
    <div className={`flex items-center gap-4 transition-opacity duration-200 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      {/* Duration inputs */}
      <div className="flex items-center gap-1.5">
        <Input
          type="number" min={0} max={999}
          value={durationMins}
          onChange={e => handleDurationChange(parseInt(e.target.value) || 0, durationSecs)}
          disabled={timer.running || disabled}
          className="w-14 text-center font-mono h-8 text-sm bg-[#1a1a1a]"
        />
        <span className="text-[#3f3f46] font-mono">:</span>
        <Input
          type="number" min={0} max={59}
          value={durationSecs}
          onChange={e => handleDurationChange(durationMins, parseInt(e.target.value) || 0)}
          disabled={timer.running || disabled}
          className="w-12 text-center font-mono h-8 text-sm bg-[#1a1a1a]"
        />
      </div>

      {/* Countdown */}
      <span className={`font-mono text-xl font-bold w-16 tabular-nums transition-colors duration-150 ${countdownColor}`}>
        {formatMs(displayMs)}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {timer.running ? (
          <Button size="sm" variant="outline" onClick={handlePause} disabled={disabled} className="h-8 px-4 text-xs">
            Pause
          </Button>
        ) : (
          <Button size="sm" variant="green" onClick={handleStart}
            disabled={disabled || isExpired || timer.snapshotMs === 0}
            className="h-8 px-4 text-xs">
            Start
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleReset} disabled={disabled}
          className="h-8 px-3 text-xs text-[#3f3f46] hover:text-[#71717a]">
          Reset
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Speaker card
// ---------------------------------------------------------------------------

interface SpeakerCardProps {
  participant: Participant
  slotTimer: TimerState
  onSlotTimerChange: (t: TimerState) => void
  onSlotTimerSync: (action: 'start' | 'pause' | 'reset', remainingMs: number) => void
}

function SpeakerCard({ participant, slotTimer, onSlotTimerChange, onSlotTimerSync }: SpeakerCardProps): React.ReactElement {
  const enabled = participant.enabled !== false

  function toggleEnabled(): void {
    chrome.runtime.sendMessage({ type: 'speaker_status', targetId: participant.id, enabled: !enabled })
  }

  function sendCue(cueType: 'up' | 'warning'): void {
    chrome.runtime.sendMessage({ type: 'cue', targetId: participant.id, cueType })
  }

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] p-5 flex flex-col gap-5">
      {/* Name + enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${enabled ? 'bg-primary' : 'bg-[#3f3f46]'}`} />
          <span className="text-lg font-semibold text-white">{participant.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono ${enabled ? 'text-primary' : 'text-[#52525b]'}`}>
            {enabled ? 'enabled' : 'disabled'}
          </span>
          <Toggle enabled={enabled} onChange={toggleEnabled} />
        </div>
      </div>

      {/* Ping buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost" size="sm"
          onClick={() => sendCue('up')}
          className="h-8 px-4 text-xs border border-primary/40 text-primary hover:bg-primary/15"
        >
          You&apos;re up
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => sendCue('warning')}
          className="h-8 px-4 text-xs border border-[#92400e] text-amber-400 hover:bg-amber-950/40"
        >
          Heads up
        </Button>
      </div>

      {/* Slot timer */}
      <div className="flex flex-col gap-2 pt-1 border-t border-[#1a1a1a]">
        <span className="text-[10px] uppercase tracking-widest text-[#3f3f46]">Slot timer</span>
        <Timer timer={slotTimer} onChange={onSlotTimerChange} onSync={onSlotTimerSync} disabled={!enabled} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

interface PersistedTimers {
  globalTimer: TimerState
  slotTimers: Record<string, TimerState>
}

function ManagerApp(): React.ReactElement {
  const [bgState, setBgState] = React.useState<BackgroundState | null>(null)
  const [globalTimer, setGlobalTimer] = React.useState<TimerState>(() => initialTimer(60))
  const [slotTimers, setSlotTimers] = React.useState<Record<string, TimerState>>({})
  const [copied, setCopied] = React.useState(false)
  const persistedRef = React.useRef(false)

  React.useEffect(() => {
    chrome.runtime.sendMessage({ type: 'getState' }, (response: BackgroundState) => {
      setBgState(response ?? { connected: false, code: null, participants: [] })
    })
    chrome.storage.session.get([TIMER_STORAGE_KEY], (result) => {
      const saved = result[TIMER_STORAGE_KEY] as PersistedTimers | undefined
      if (saved) {
        setGlobalTimer(saved.globalTimer)
        setSlotTimers(saved.slotTimers)
      }
      persistedRef.current = true
    })
    const listener = (message: BackgroundState): void => { setBgState(message) }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

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

  React.useEffect(() => {
    if (!persistedRef.current) return
    void chrome.storage.session.set({ [TIMER_STORAGE_KEY]: { globalTimer, slotTimers } as PersistedTimers })
  }, [globalTimer, slotTimers])

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
    return <div className="flex items-center justify-center h-40 text-[#52525b] text-sm">Loading…</div>
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
    <div className="flex flex-col gap-8">

      {/* Session header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-3xl font-bold tracking-[0.2em] text-white">{bgState.code}</span>
          <span className="text-sm text-[#3f3f46]">
            {speakers.length} {speakers.length === 1 ? 'speaker' : 'speakers'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLink}
            className="h-9 px-4 border border-[#27272a] text-[#71717a] text-sm hover:border-[#3f3f46] hover:text-white">
            {copied ? 'Copied!' : 'Copy speaker link'}
          </Button>
          <Button variant="ghost" size="sm" onClick={endSession}
            className="h-9 px-4 border border-[#27272a] text-[#71717a] text-sm hover:border-red-800 hover:text-red-400">
            End session
          </Button>
        </div>
      </div>

      {/* Session timer */}
      <div className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] p-5">
        <p className="text-[10px] uppercase tracking-widest text-[#3f3f46] mb-4">Session timer</p>
        <Timer timer={globalTimer} onChange={setGlobalTimer} onSync={syncGlobal} />
      </div>

      {/* Speakers */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] uppercase tracking-widest text-[#3f3f46]">
          Speakers ({speakers.length})
        </p>
        {speakers.length === 0 ? (
          <p className="text-sm text-[#27272a] italic py-4">No speakers connected yet.</p>
        ) : (
          speakers.map(p => (
            <SpeakerCard
              key={p.id}
              participant={p}
              slotTimer={slotTimers[p.id] ?? initialTimer(10)}
              onSlotTimerChange={t => setSlotTimers(prev => ({ ...prev, [p.id]: t }))}
              onSlotTimerSync={(action, ms) => syncSlot(p.id, action, ms)}
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
    <div className="max-w-3xl mx-auto px-8 py-10">
      <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-[#3f3f46] uppercase mb-8">
        nextslide.app — session manager
      </p>
      <ManagerApp />
    </div>
  </div>
)
