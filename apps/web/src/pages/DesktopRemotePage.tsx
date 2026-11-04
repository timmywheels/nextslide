import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { DesktopRemote, type RemoteSnapshot } from '../lib/desktop-remote'
import './desktop-remote.css'

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin

export default function DesktopRemotePage() {
  const { id = '' } = useParams<{ id: string }>()
  const [token] = useState(() => {
    const fragment = window.location.hash.slice(1)
    try {
      if (fragment) { sessionStorage.setItem(`nextslide-invite-${id}`, fragment); history.replaceState(history.state, '', window.location.pathname) }
      return fragment || sessionStorage.getItem(`nextslide-invite-${id}`) || ''
    } catch { return fragment }
  })
  const [name, setName] = useState('')
  const [joined, setJoined] = useState(false)
  const [lastDirection, setLastDirection] = useState<'next' | 'prev'>('next')
  const [state, setState] = useState<RemoteSnapshot>({ connected: false, ready: false, enabled: false, pending: false, message: 'Connecting…', error: '', latency: null })
  const remote = useRef<DesktopRemote | null>(null)
  useEffect(() => {
    if (!joined || !token) return
    const connection = new DesktopRemote(API_BASE, id, token, name.trim(), setState)
    remote.current = connection
    return () => { connection.close(); remote.current = null }
  }, [id, token, joined])

  return <div className="desktop-remote">
    <header><div className="remote-brand"><img src="/icons/nextslide.svg" alt="" width="26" height="26" />Nextslide</div>{joined && <span className={`remote-status ${state.ready ? 'is-ready' : ''}`}><i />{state.ready ? 'Ready' : state.connected ? 'Paused' : 'Connecting'}</span>}</header>
    <main>
      {!token ? <div className="remote-intro"><h1>Invalid invite link</h1><p>Ask the host for a new invite link.</p></div>
        : !joined ? <form className="remote-intro" onSubmit={event => { event.preventDefault(); if (name.trim()) setJoined(true) }}>
          <h1>Join presentation</h1><p>Enter your name to join. The host will give you control when it’s your turn.</p>
          <label htmlFor="speaker-name">Your name</label><input id="speaker-name" value={name} onChange={event => setName(event.target.value)} maxLength={48} autoComplete="given-name" placeholder="Enter your name" required />
          <button className="remote-join" type="submit" disabled={!name.trim()}>Join presentation</button><small>No account required.</small>
        </form> : <>
          <div className="remote-welcome"><div className="remote-eyebrow">{name}</div><h1>{state.ready ? 'Slide controls' : !state.connected ? 'Connecting…' : !state.enabled ? 'Waiting for the host' : 'Waiting for the presentation'}</h1><p aria-live="polite">{state.message}</p></div>
          <div className="remote-controls">
            <button className={`remote-next ${state.pending && lastDirection === 'next' ? 'is-sending' : ''}`} aria-busy={state.pending && lastDirection === 'next'} disabled={!state.ready || state.pending} onClick={() => { setLastDirection('next'); remote.current?.click('next') }}><span className="remote-progress" aria-hidden="true" /><ArrowRight size={54} strokeWidth={1.5} /><span>Next slide</span></button>
            <button className={`remote-prev ${state.pending && lastDirection === 'prev' ? 'is-sending' : ''}`} aria-busy={state.pending && lastDirection === 'prev'} disabled={!state.ready || state.pending} onClick={() => { setLastDirection('prev'); remote.current?.click('prev') }}><span className="remote-progress" aria-hidden="true" /><ArrowLeft size={18} /><span>Previous slide</span></button>
          </div>
          {state.error ? <p className="remote-error" role="alert">{state.error}</p> : <p className="remote-reassurance">Only one speaker can control slides at a time.</p>}
          <button className="remote-leave" onClick={() => { remote.current?.close(); setJoined(false) }}>Leave session</button>
        </>}
    </main><footer>Nextslide</footer>
  </div>
}
