import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSession, type TimerSync } from '../hooks/useSession'
import { getSession } from '../lib/api'

type SessionState = 'loading' | 'not_found' | 'enter_name'

const FLASH_DURATION_MS = 150
const NAME_KEY = 'nextslide_name'
const base = { backgroundColor: '#0a0a0a', color: '#fafafa' }

// ---------------------------------------------------------------------------
// Local clock
// ---------------------------------------------------------------------------

function LocalTime(): React.ReactElement {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono text-xs text-[#52525b]">{time}</span>
}

// ---------------------------------------------------------------------------
// Timer display (receives a sync event and counts down locally)
// ---------------------------------------------------------------------------

interface TimerDisplayProps {
  sync: TimerSync
  prominent?: boolean
}

const TIMER_MILESTONES = [30_000, 10_000]

function TimerDisplay({ sync, prominent = false }: TimerDisplayProps): React.ReactElement | null {
  const [, setTick] = useState(0)
  const [flash, setFlash] = useState(false)
  const prevMsRef = useRef(sync.remainingMs)

  useEffect(() => {
    if (sync.action !== 'start') return
    prevMsRef.current = sync.remainingMs
    const id = setInterval(() => {
      const elapsed = Date.now() - sync.syncedAt
      const ms = Math.max(0, sync.remainingMs - elapsed)
      for (const m of TIMER_MILESTONES) {
        if (prevMsRef.current > m && ms <= m) {
          setFlash(true)
          setTimeout(() => setFlash(false), 500)
        }
      }
      prevMsRef.current = ms
      setTick(n => n + 1)
    }, 250)
    return () => clearInterval(id)
  }, [sync.action, sync.syncedAt, sync.remainingMs])

  if (sync.action === 'reset') return null

  const elapsed = sync.action === 'start' ? Date.now() - sync.syncedAt : 0
  const remaining = Math.max(0, sync.remainingMs - elapsed)
  const totalSec = Math.ceil(remaining / 1000)
  const display = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
  const isWarning = remaining > 0 && remaining < 60_000
  const isExpired = remaining === 0

  const colorClass = flash
    ? 'text-white'
    : isExpired
    ? 'text-red-500'
    : isWarning
    ? 'text-amber-400'
    : prominent
    ? 'text-white'
    : 'text-[#52525b]'

  if (prominent) {
    return (
      <div className={`text-center font-mono font-bold text-4xl tabular-nums transition-colors duration-150 ${colorClass} ${flash ? 'scale-110' : ''}`}>
        {display}
      </div>
    )
  }

  return (
    <span className={`font-mono text-xs font-bold tabular-nums transition-colors duration-150 ${colorClass}`}>
      {display}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Active speaker view — only mounted after the user clicks Join.
// useSession lives here so the WebSocket is never opened before that point.
// ---------------------------------------------------------------------------

function SpeakerActive({ sessionCode, name }: { sessionCode: string; name: string }): React.ReactElement {
  const [nextFlash, setNextFlash] = useState(false)
  const [prevFlash, setPrevFlash] = useState(false)
  const [activeCue, setActiveCue] = useState<'up' | 'warning' | null>(null)
  const nextFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCue = useCallback((cueType: 'up' | 'warning'): void => {
    if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
    setActiveCue(cueType)
    if (navigator.vibrate) navigator.vibrate(cueType === 'up' ? [200, 100, 200] : [100])
    cueTimerRef.current = setTimeout(() => setActiveCue(null), cueType === 'up' ? 3000 : 5000)
  }, [])

  const { connected, participants, presenterConnected, speakerEnabled, globalTimerSync, speakerTimerSync, sendCommand } = useSession(
    sessionCode, 'speaker', name, handleCue,
  )

  // Esc dismisses the cue overlay
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setActiveCue(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    return () => {
      if (nextFlashTimer.current) clearTimeout(nextFlashTimer.current)
      if (prevFlashTimer.current) clearTimeout(prevFlashTimer.current)
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
    }
  }, [])

  const handleNext = useCallback((): void => {
    sendCommand('next')
    setNextFlash(true)
    if (nextFlashTimer.current) clearTimeout(nextFlashTimer.current)
    nextFlashTimer.current = setTimeout(() => setNextFlash(false), FLASH_DURATION_MS)
  }, [sendCommand])

  const handlePrev = useCallback((): void => {
    sendCommand('prev')
    setPrevFlash(true)
    if (prevFlashTimer.current) clearTimeout(prevFlashTimer.current)
    prevFlashTimer.current = setTimeout(() => setPrevFlash(false), FLASH_DURATION_MS)
  }, [sendCommand])

  const presenter = participants.find(p => p.role === 'presenter')

  return (
    <div className="min-h-screen flex flex-col" style={base}>
      {/* Ping overlay */}
      {activeCue && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${
          activeCue === 'up' ? 'bg-[#14532d]/95' : 'bg-amber-950/95'
        }`}>
          <button
            onClick={() => setActiveCue(null)}
            className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-2xl leading-none transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="text-center px-8">
            <div className={`text-5xl font-bold mb-3 ${activeCue === 'up' ? 'text-[#22c55e]' : 'text-amber-400'}`}>
              {activeCue === 'up' ? "You're up!" : 'Heads up!'}
            </div>
            <div className="text-xs text-white/30 tracking-wide">esc to dismiss</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        {presenter
          ? <span className="font-mono text-xs text-[#22c55e]">{presenter.name} · presenting</span>
          : <span className="font-mono text-xs text-[#52525b]">nextslide.app</span>
        }
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#52525b] tracking-widest uppercase">{sessionCode}</span>
          {globalTimerSync && <TimerDisplay sync={globalTimerSync} />}
        </div>
        <LocalTime />
      </header>

      {/* Speaker pills */}
      {participants.filter(p => p.role === 'speaker').length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-1">
          {participants.filter(p => p.role === 'speaker').map(p => (
            <span key={p.id} className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#a1a1aa] font-mono">
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Status banners */}
      {!speakerEnabled && connected && (
        <div className="flex items-center justify-center px-6 py-2">
          <div className="rounded-lg border border-[#27272a] bg-[#1a1a1a] px-4 py-2 text-xs text-[#71717a] text-center">
            Waiting for your turn…
          </div>
        </div>
      )}
      {!presenterConnected && connected && (
        <div className="flex items-center justify-center px-6 py-2">
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-300 text-center">
            Waiting for presenter…
          </div>
        </div>
      )}

      {/* Slot timer */}
      {speakerTimerSync && speakerTimerSync.action !== 'reset' && (
        <div className="px-6 pt-4">
          <TimerDisplay sync={speakerTimerSync} prominent />
        </div>
      )}

      {/* Controls */}
      <main className="flex-1 flex flex-col gap-4 p-4 pb-6">
        <button
          onPointerDown={handleNext}
          disabled={!connected || !speakerEnabled}
          aria-label="Next slide"
          className="flex-[2] min-h-[80px] rounded-2xl font-bold text-3xl text-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] touch-manipulation"
          style={{
            backgroundColor: nextFlash ? '#16a34a' : '#22c55e',
            transition: `background-color ${FLASH_DURATION_MS}ms ease`,
          }}
        >
          Next
        </button>
        <button
          onPointerDown={handlePrev}
          disabled={!connected || !speakerEnabled}
          aria-label="Previous slide"
          className="flex-1 min-h-[80px] rounded-2xl font-bold text-2xl text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] touch-manipulation"
          style={{
            backgroundColor: prevFlash ? '#52525b' : '#27272a',
            transition: `background-color ${FLASH_DURATION_MS}ms ease`,
          }}
        >
          Prev
        </button>
      </main>

      {!connected && (
        <div className="px-4 pb-4 text-center">
          <p className="text-xs text-[#71717a]">Reconnecting…</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry point — handles session lookup and name input. No WebSocket here.
// ---------------------------------------------------------------------------

export default function SpeakerPage(): React.ReactElement {
  const { code } = useParams<{ code: string }>()
  const sessionCode = (code ?? '').toUpperCase()

  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const [name, setName] = useState('')
  const [confirmedName, setConfirmedName] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionCode) { setSessionState('not_found'); return }
    getSession(sessionCode)
      .then(res => setSessionState(res.exists ? 'enter_name' : 'not_found'))
      .catch(() => setSessionState('not_found'))
  }, [sessionCode])

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY)
    if (saved) setName(saved)
  }, [])

  function handleJoin(): void {
    const trimmed = name.trim()
    if (!trimmed) return
    localStorage.setItem(NAME_KEY, trimmed)
    setConfirmedName(trimmed)
  }

  // Once confirmed, hand off to SpeakerActive which owns the WebSocket
  if (confirmedName) {
    return <SpeakerActive sessionCode={sessionCode} name={confirmedName} />
  }

  if (sessionState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={base}>
        <p className="text-[#71717a] font-mono text-sm">Loading…</p>
      </div>
    )
  }

  if (sessionState === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={base}>
        <p className="text-2xl font-bold">Session not found</p>
        <p className="text-[#a1a1aa] text-sm max-w-xs">
          The session <span className="font-mono text-white">{sessionCode}</span> doesn't exist or has expired.
        </p>
        <Link to="/" className="mt-4 text-sm text-[#22c55e] underline underline-offset-4 hover:text-[#16a34a] transition-colors">
          Go home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8" style={base}>
      <div className="text-center">
        <p className="font-mono text-xs text-[#52525b] uppercase tracking-widest mb-1">Joining session</p>
        <p className="font-mono text-2xl font-bold tracking-widest">{sessionCode}</p>
      </div>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          autoFocus
          maxLength={32}
          className="w-full px-4 py-3 rounded-xl text-lg text-center font-medium bg-[#1a1a1a] border border-[#27272a] text-white placeholder-[#52525b] focus:outline-none focus:border-[#22c55e]"
        />
        <button
          onClick={handleJoin}
          disabled={!name.trim()}
          className="w-full py-4 rounded-xl font-bold text-xl text-black disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#22c55e' }}
        >
          Join
        </button>
      </div>
    </div>
  )
}
