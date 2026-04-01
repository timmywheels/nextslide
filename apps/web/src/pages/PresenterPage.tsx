import React, { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { deleteSession, getSession } from '../lib/api'
import type { Participant } from '@nextslide/types'

function getSpeakerUrl(code: string): string {
  return `${window.location.origin}/s/${code}`
}

export default function PresenterPage(): React.ReactElement {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const sessionCode = (code ?? '').toUpperCase()
  const speakerUrl = getSpeakerUrl(sessionCode)

  const [participantCount, setParticipantCount] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    async function poll(): Promise<void> {
      try {
        const s = await getSession(sessionCode)
        setParticipantCount(s.participantCount)
        setParticipants(s.participants)
      } catch { /* ignore */ }
    }
    void poll()
    const id = setInterval(() => void poll(), 3000)
    return () => clearInterval(id)
  }, [sessionCode])

  const handleCopyLink = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(speakerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [speakerUrl])


  const handleCopyCode = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sessionCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [sessionCode])

  const handleEndSession = useCallback(async (): Promise<void> => {
    setEndingSession(true)
    try {
      await deleteSession(sessionCode)
    } catch {
      // best-effort; navigate regardless
    }
    void navigate('/')
  }, [sessionCode, navigate])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#0a0a0a', color: '#fafafa' }}
    >
      {/* Extension banner */}
      {!bannerDismissed && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-950/60 border-b border-amber-800/50 text-sm text-amber-200">
          <span>
            Install the{' '}
            <a href="#" className="underline underline-offset-2 hover:text-amber-100">
              Chrome extension
            </a>{' '}
            to enable slide control in Google Slides.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-amber-400 hover:text-amber-200 transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f]">
        <a href="/" className="font-mono font-bold text-lg tracking-tight hover:text-[#a1a1aa] transition-colors">
          nextslide.app
        </a>
        <div className="flex items-center gap-3">
          <Badge variant="default">
            {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </Badge>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10 max-w-2xl mx-auto w-full">
        {/* Session code */}
        <div className="text-center">
          <p className="text-sm text-[#71717a] uppercase tracking-widest mb-3 font-mono">
            Session code
          </p>
          <button
            onClick={() => void handleCopyCode()}
            title="Click to copy code"
            className="font-mono text-6xl sm:text-8xl font-bold tracking-widest text-white hover:text-primary transition-colors cursor-pointer"
          >
            {sessionCode}
          </button>
          {codeCopied && (
            <p className="text-xs text-primary mt-2 font-mono">Code copied!</p>
          )}
          <p className="text-xs text-[#52525b] mt-2">Click code to copy</p>
        </div>

        {/* QR code */}
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          <QRCode
            value={speakerUrl}
            size={200}
            bgColor="#ffffff"
            fgColor="#0a0a0a"
            level="M"
          />
        </div>

        <p className="text-sm text-[#71717a] text-center max-w-xs">
          Speakers join from any device — phone, tablet, or laptop. No install required.
        </p>

        {/* Speaker URL */}
        <div className="w-full rounded-lg border border-[#27272a] bg-[#111111] px-4 py-3 flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-[#a1a1aa] truncate">{speakerUrl}</span>
          <Button size="sm" variant={copied ? 'green' : 'outline'} onClick={() => void handleCopyLink()} className="shrink-0">
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        {/* Participant list */}
        {participants.length > 0 && (
          <div className="w-full rounded-lg border border-[#27272a] bg-[#111111] px-4 py-3">
            <p className="text-xs text-[#52525b] uppercase tracking-widest font-mono mb-2">
              Connected ({participantCount})
            </p>
            <ul className="flex flex-col gap-1">
              {participants.map(p => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.role === 'presenter' ? 'bg-[#22c55e]' : 'bg-[#3b82f6]'}`} />
                  <span className="text-white">{p.name}</span>
                  <span className="text-[#52525b] text-xs ml-auto">{p.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* End session */}
        <Button
          variant="destructive"
          size="lg"
          onClick={() => void handleEndSession()}
          disabled={endingSession}
          className="w-full sm:w-auto"
        >
          {endingSession ? 'Ending session…' : 'End session'}
        </Button>
      </main>
    </div>
  )
}
