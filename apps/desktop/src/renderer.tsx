import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import QRCode from 'react-qr-code'
import { ArrowRight, Check, ChevronLeft, Copy, Monitor, Pause, Power, Settings, ShieldCheck, Users, X } from 'lucide-react'
import { HostSession, type HostSnapshot } from './host-session'
import type { NativeStatus, PresentationApp } from './types'
import './style.css'

const empty: HostSnapshot = { guests: [], connected: false, invite: '', error: '' }
const api = window.nextslide

function App() {
  const [apps, setApps] = useState<PresentationApp[]>([])
  const [selected, setSelected] = useState<PresentationApp | null>(null)
  const [status, setStatus] = useState<NativeStatus>({ trusted: false, running: false, frontmost: false })
  const [service, setService] = useState('')
  const [settings, setSettings] = useState(false)
  const [snapshot, setSnapshot] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [nativeError, setNativeError] = useState('')
  const [copied, setCopied] = useState(false)
  const [permissionHelp, setPermissionHelp] = useState(false)
  const [deckURL, setDeckURL] = useState('')
  const [useOpen, setUseOpen] = useState(false)
  const session = useRef<HostSession | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const refreshing = useRef(false)

  async function refresh() {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const [available, native] = await Promise.all([api.apps(), api.status()])
      setApps(available)
      setStatus(native)
      setSelected(current => current ? available.find(a => a.tabKey === current.tabKey && a.pid === current.pid && a.bundleId === current.bundleId) ?? current : null)
      setNativeError('')
      session.current?.updateStatus(native)
    } catch (err) {
      setStatus(current => ({ ...current, trusted: false }))
      session.current?.updateStatus({ trusted: false, running: false, frontmost: false })
      setNativeError(message(err))
    } finally { refreshing.current = false }
  }
  async function end() {
    const current = session.current
    session.current = null
    await api.active(false)
    setRunning(false)
    setSnapshot(empty)
    try { await current?.stop() } finally { await api.stopHosting() }
  }
  useEffect(() => {
    void api.config().then(config => setService(config.service)).catch(err => setError(message(err)))
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    const locked = () => { void end(); setError('Session ended because your Mac was locked or went to sleep.') }
    const shutdown = () => { void end().finally(() => api.quit()) }
    const refreshNow = () => { void refresh() }
    const hostingFailed = (event: Event) => { void end(); setError((event as CustomEvent<string>).detail) }
    window.addEventListener('nextslide-locked', locked)
    window.addEventListener('nextslide-shutdown', shutdown)
    window.addEventListener('nextslide-refresh', refreshNow)
    window.addEventListener('focus', refreshNow)
    window.addEventListener('nextslide-hosting-error', hostingFailed)
    return () => { clearInterval(timer); clearTimeout(copyTimer.current); window.removeEventListener('nextslide-locked', locked); window.removeEventListener('nextslide-shutdown', shutdown); window.removeEventListener('nextslide-refresh', refreshNow); window.removeEventListener('focus', refreshNow); window.removeEventListener('nextslide-hosting-error', hostingFailed) }
  }, [])

  async function choose(value: string) {
    const next = apps.find(a => (a.tabKey ?? String(a.pid)) === value) ?? null
    await api.selectApp(next)
    setSelected(next)
    await refresh()
  }

  async function openDeck() {
    setBusy(true); setError('')
    try { setSelected(await api.openDeck(deckURL)); setUseOpen(true); await refresh() }
    catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }

  async function start() {
    setBusy(true); setError('')
    try {
      await api.active(true)
      const hosting = await api.startHosting()
      const host = new HostSession(hosting.service, command => api.dispatch(command), setSnapshot, () => { void end() }, hosting.inviteOrigin, hosting.createToken)
      session.current = host
      await host.start()
      if (session.current !== host) throw new Error('This session was ended.')
      host.updateStatus(await api.status())
      setRunning(true)
    } catch (err) { await end(); setError(message(err)) }
    finally { setBusy(false) }
  }

  async function copy() {
    await api.copy(snapshot.invite)
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  const online = snapshot.guests.filter(g => g.online)
  const presentationReady = status.trusted && status.running && (status.requiresFocus === false || status.frontmost)
  return <div className="shell">
    <header><div className="brand"><span className="brand-icon"><ArrowRight size={16} /></span> nextslide<span className="brand-dot">.</span></div>
      <button className="icon-button" aria-label="Hide Nextslide" onClick={() => void api.hide()}><X size={16} /></button></header>
    <main>
      {settings ? <>
        <button className="back" onClick={() => setSettings(false)}><ChevronLeft size={14} /> Back</button>
        <h1>Settings</h1><p className="subtle">Public invites work automatically.</p>
        <label className="field-label" htmlFor="service">Service address</label>
        <input id="service" value={service} disabled={running} onChange={event => setService(event.target.value)} spellCheck={false} />
        <p className="hint">Leave blank to open a public tunnel when you start a session. For a self-hosted service, enter its HTTPS address.</p>
        <button className="primary" disabled={running} onClick={() => { void api.saveService(service).then(() => { setSettings(false); setError('') }).catch(err => setError(message(err))) }}>Save settings</button>
      </> : !running ? <>
        <div className="eyebrow">HOST</div>
        <h1>Host a presentation</h1>
        <p className="subtle intro">Open your slides and invite speakers to control them.</p>
        {!useOpen && <><label className="field-label" htmlFor="deck-url">Google Slides link</label>
          <input id="deck-url" placeholder="Paste a Google Slides link" value={deckURL} disabled={busy} onChange={event => setDeckURL(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && deckURL.trim() && !busy) void openDeck() }} />
          <button className="primary open-deck" disabled={!deckURL.trim() || busy} onClick={() => void openDeck()}>{busy ? 'Opening your presentation…' : 'Open presentation'} {!busy && <ArrowRight size={14} />}</button>
          <p className="hint">Opens a separate Chrome window. Sign in to Google there if prompted.</p>
        </>}
        <button className="deck-switch" disabled={busy} onClick={() => setUseOpen(!useOpen)}>{useOpen ? 'Paste a different deck link' : selected?.tabKey ? 'Back to your presentation' : 'Use Keynote or PowerPoint'}</button>
        {useOpen && <><label className="field-label" htmlFor="presentation">Presentation</label>
        <div className="select-wrap"><Monitor size={17} /><select id="presentation" disabled={busy} value={selected?.tabKey ?? selected?.pid ?? ''} onChange={event => { void choose(event.target.value).catch(err => setError(message(err))) }}>
          <option value="">Choose your deck</option>
          {apps.map(app => <option key={app.tabKey ?? app.pid} value={app.tabKey ?? app.pid}>{app.name}{app.tabKey ? '' : ' (keep in front)'}</option>)}
        </select></div>
        <p className="hint">{selected?.tabKey ? status.running ? 'Presentation ready. Share this window in your call. You can use other windows while presenting.' : status.message || 'Open the presentation window to finish setup.' : 'Keynote and PowerPoint use keyboard control and must stay in front.'}</p>
        {selected?.tabKey && <button className="deck-switch" onClick={() => void api.showPresentation().catch(err => setError(message(err)))}>Show presentation window <ArrowRight size={13} /></button>}</>}
        {selected && !selected.tabKey && !status.trusted && <div className="permission"><ShieldCheck size={20} /><div><strong>Accessibility access needed</strong><p>Allow Nextslide to send slide keypresses.</p><button onClick={() => { void api.requestAccess().catch(err => setError(message(err))) }}>Allow Accessibility access <ArrowRight size={13} /></button>
          <button className="permission-help" aria-expanded={permissionHelp} onClick={() => setPermissionHelp(!permissionHelp)}>Already enabled?</button>
          {permissionHelp && <div><p>macOS may remember an older copy. In Accessibility settings, remove Nextslide with −, then use + to add the current app and enable it. Access is checked automatically.</p><button onClick={() => { void api.revealApp().catch(err => setError(message(err))) }}>Show current app in Finder <ArrowRight size={13} /></button></div>}
        </div></div>}
        {selected && useOpen && <>
          <button className="primary" disabled={busy || (!selected.tabKey && (!status.running || !status.trusted))} onClick={() => void start()}>{busy ? 'Creating invite…' : 'Create speaker invite'} {!busy && <ArrowRight size={17} />}</button>
          <p className="hint invite-hint">Speakers can join while you finish setup.</p>
        </>}
        <p className="footnote">Speakers join in their browser.</p>
      </> : <>
        <div className="session-heading"><div><div className="eyebrow">HOST</div><h1>Your session</h1></div><span className={`status-pill ${snapshot.connected && presentationReady ? '' : 'waiting'}`}><i />{snapshot.connected ? presentationReady ? 'Live' : 'Invites open' : 'Reconnecting'}</span></div>
        <div className="target"><Monitor size={15} /><span>{selected?.name}</span><span className="target-note">{selected?.tabKey ? status.running ? 'Background control' : 'Open slideshow' : status.frontmost ? 'In front' : 'Bring slideshow to front'}</span></div>
        <div className="invite-card"><div className="qr">{snapshot.invite && <QRCode value={snapshot.invite} size={116} level="M" />}</div><div><h2>Invite speakers</h2><p>Share the link or<br />scan the QR code.</p><button className="copy" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy invite link'}</button></div></div>
        {!presentationReady && <div className="presentation-waiting" role="status"><strong>Speakers can join now.</strong><p>{status.message || 'Slide controls are paused until the presentation is ready.'}</p>{selected?.tabKey && <button onClick={() => void api.showPresentation().catch(err => setError(message(err)))}>Show presentation window <ArrowRight size={12} /></button>}</div>}
        <div className="section-label"><span><Users size={14} /> Speakers <b>{online.length}</b></span>{online.some(g => g.enabled) && <button onClick={() => session.current?.pauseAll()}><Pause size={12} /> Pause all</button>}</div>
        <div className="guests">
          {online.length === 0 ? <div className="empty"><span className="empty-orbit"><Users size={22} /></span><strong>No speakers connected</strong><p>Share the invite link to add speakers.</p></div>
            : online.map(guest => <div className="guest" key={guest.id}><span className={`avatar ${guest.enabled ? 'allowed' : ''}`}>{guest.name.slice(0, 1).toUpperCase()}</span><div className="guest-info"><strong>{guest.name}</strong><small>{guest.enabled ? presentationReady ? 'Can control slides' : 'Allowed · waiting for presentation' : 'Waiting for your approval'}</small></div><button className={guest.enabled ? 'pause' : 'allow'} onClick={() => session.current?.enable(guest.id, !guest.enabled)}>{guest.enabled ? 'Pause' : 'Allow'}</button></div>)}
        </div>
        <button className="end-session" onClick={() => { void end().catch(err => setError(message(err))) }}>End session</button>
        <p className="footnote">Only one speaker can control slides at a time.</p>
      </>}
      {(error || nativeError || snapshot.error) && <div className="error" role="alert">{error || nativeError || snapshot.error}</div>}
    </main>
    <footer><span>Host controls</span><div><button className="icon-button" aria-label="Settings" onClick={() => setSettings(!settings)}><Settings size={15} /></button><button className="icon-button" aria-label="Quit Nextslide" onClick={() => { void end().finally(() => api.quit()) }}><Power size={15} /></button></div></footer>
  </div>
}
function message(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Something went wrong. Please try again.' }
createRoot(document.getElementById('root')!).render(<App />)
