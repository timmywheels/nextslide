import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { getSession } from '../lib/api'

type SessionState = 'loading' | 'not_found' | 'enter_name' | 'ready'

const FLASH_DURATION_MS = 150
const NAME_KEY = 'nextslide_name'

export default function SpeakerPage(): React.ReactElement {
  const { code } = useParams<{ code: string }>()
  const sessionCode = (code ?? '').toUpperCase()

  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const [name, setName] = useState('')
  const [confirmedName, setConfirmedName] = useState<string | undefined>(undefined)
  const [nextFlash, setNextFlash] = useState(false)
  const [prevFlash, setPrevFlash] = useState(false)
  const nextFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { connected, participantCount, participants, presenterConnected, sendCommand } = useSession(
    sessionCode,
    'speaker',
    confirmedName,
  )

  useEffect(() => {
    if (!sessionCode) { setSessionState('not_found'); return }
    getSession(sessionCode)
      .then((res) => setSessionState(res.exists ? 'enter_name' : 'not_found'))
      .catch(() => setSessionState('not_found'))
  }, [sessionCode])

  // Pre-fill saved name
  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY)
    if (saved) setName(saved)
  }, [])

  const handleJoin = useCallback((): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    localStorage.setItem(NAME_KEY, trimmed)
    setConfirmedName(trimmed)
    setSessionState('ready')
  }, [name])

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

  useEffect(() => {
    return () => {
      if (nextFlashTimer.current) clearTimeout(nextFlashTimer.current)
      if (prevFlashTimer.current) clearTimeout(prevFlashTimer.current)
    }
  }, [])

  const base = { backgroundColor: '#0a0a0a', color: '#fafafa' }

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

  if (sessionState === 'enter_name') {
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
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
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

  return (
    <div className="min-h-screen flex flex-col" style={base}>
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-xs text-[#52525b]">nextslide</span>
        <span className="font-mono text-xs text-[#52525b] tracking-widest uppercase">{sessionCode}</span>
        <span className="font-mono text-xs text-[#52525b]">
          {participantCount} {participantCount === 1 ? 'person' : 'people'}
        </span>
      </header>

      {participants.length > 1 && (
        <div className="px-4 pb-1 flex flex-wrap gap-1">
          {participants.filter(p => p.role === 'speaker').map(p => (
            <span key={p.id} className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#a1a1aa] font-mono">
              {p.name}
            </span>
          ))}
        </div>
      )}

      {!presenterConnected && connected && (
        <div className="flex items-center justify-center px-6 py-2">
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-300 text-center">
            Waiting for presenter…
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col gap-4 p-4 pb-6">
        <button
          onPointerDown={handleNext}
          disabled={!connected}
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
          disabled={!connected}
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
