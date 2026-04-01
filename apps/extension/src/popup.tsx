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
// Connected view
// ---------------------------------------------------------------------------

interface ConnectedViewProps {
  state: BackgroundState
}

function ConnectedView({ state }: ConnectedViewProps): React.ReactElement {
  const code = state.code ?? ''
  const speakers = (state.participants ?? []).filter(p => p.role === 'speaker')
  const [copied, setCopied] = React.useState(false)

  function copyLink(): void {
    const url = `${WEB_URL}/s/${code}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function endSession(): void {
    chrome.runtime.sendMessage({ type: 'disconnect' })
  }

  function openSettings(e: React.MouseEvent): void {
    e.preventDefault()
    void chrome.runtime.openOptionsPage()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Live indicator + code */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-[#22c55e]">
            Live
          </span>
        </div>
        <div className="font-mono text-3xl font-bold tracking-[0.2em] text-white">
          {code}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLink}
          className="mt-0.5 border border-[#3f3f46] text-[#a1a1aa] text-xs px-3 py-1 h-auto hover:border-white hover:text-white"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>

      {/* Speakers section */}
      <div className="bg-[#111111] border border-[#27272a] rounded-lg px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-1.5">
          Speakers ({speakers.length})
        </div>
        {speakers.length === 0 ? (
          <div className="text-xs text-[#3f3f46] italic">No one yet — share the link!</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
            {speakers.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-[#d4d4d8]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* End session */}
      <Button
        variant="ghost"
        size="sm"
        onClick={endSession}
        className="w-full border border-[#3f3f46] text-[#a1a1aa] text-xs hover:border-red-500 hover:text-red-400"
      >
        End session
      </Button>

      {/* Settings link */}
      <div className="text-center">
        <a
          href="#"
          onClick={openSettings}
          className="text-[11px] text-[#3f3f46] no-underline hover:text-[#71717a] transition-colors"
        >
          Settings
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disconnected view
// ---------------------------------------------------------------------------

interface DisconnectedViewProps {
  initialError?: string | null
}

function DisconnectedView({ initialError }: DisconnectedViewProps): React.ReactElement {
  const [name, setName] = React.useState<string>(
    () => localStorage.getItem('nextslide_presenter_name') ?? ''
  )
  const [code, setCode] = React.useState<string>('')
  const [status, setStatus] = React.useState<string>('')
  const [statusIsError, setStatusIsError] = React.useState(false)
  const [error, setError] = React.useState<string | null>(initialError ?? null)

  React.useEffect(() => {
    chrome.storage.local.get(['lastCode'], (r) => {
      if (r['lastCode'] && !code) setCode(r['lastCode'] as string)
    })
  }, [])

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  }

  function handleStart(): void {
    const trimmedName = name.trim()
    if (trimmedName) localStorage.setItem('nextslide_presenter_name', trimmedName)
    setStatus('Starting\u2026')
    setStatusIsError(false)
    chrome.runtime.sendMessage(
      { type: 'startSession', name: trimmedName || undefined },
      (res: { code?: string; error?: string }) => {
        if (res?.error) {
          setStatus(res.error)
          setStatusIsError(true)
        }
      }
    )
  }

  function handleJoin(): void {
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (trimmedCode.length !== 6) {
      setStatus('Enter a 6-character code')
      setStatusIsError(true)
      return
    }
    if (trimmedName) localStorage.setItem('nextslide_presenter_name', trimmedName)
    chrome.storage.local.set({ lastCode: trimmedCode })
    chrome.runtime.sendMessage({ type: 'connect', code: trimmedCode, name: trimmedName || undefined })
    setStatus('Connecting\u2026')
    setStatusIsError(false)
  }

  function openSettings(e: React.MouseEvent): void {
    e.preventDefault()
    void chrome.runtime.openOptionsPage()
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id="name"
        placeholder="Your name"
        maxLength={32}
        value={name}
        onChange={e => setName(e.target.value)}
        className="font-sans"
      />

      <Button variant="green" className="w-full" onClick={handleStart}>
        Start session
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-2 my-1 text-[#3f3f46] text-[11px]">
        <span className="flex-1 h-px bg-[#27272a]" />
        or join with code
        <span className="flex-1 h-px bg-[#27272a]" />
      </div>

      <div className="flex gap-2 items-stretch">
        <Input
          id="code"
          placeholder="ABC123"
          maxLength={6}
          value={code}
          onChange={handleCodeChange}
          className="text-center text-xl tracking-widest uppercase flex-1"
        />
        <Button
          variant="outline"
          onClick={handleJoin}
          className="shrink-0 px-4"
        >
          Join
        </Button>
      </div>

      {/* Status / error area */}
      {status && (
        <div className={`text-xs mt-0.5 ${statusIsError ? 'text-red-500' : 'text-[#71717a]'}`}>
          {status}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}

      {/* Settings link */}
      <div className="text-center mt-1">
        <a
          href="#"
          onClick={openSettings}
          className="text-[11px] text-[#3f3f46] no-underline hover:text-[#71717a] transition-colors"
        >
          Settings
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------

function App(): React.ReactElement {
  const [bgState, setBgState] = React.useState<BackgroundState | null>(null)

  React.useEffect(() => {
    // Get initial state
    chrome.runtime.sendMessage({ type: 'getState' }, (response: BackgroundState) => {
      setBgState(response ?? { connected: false, code: null, participants: [] })
    })

    // Listen for live state updates from background
    const listener = (message: BackgroundState): void => {
      setBgState(prev => {
        // If error arrives while disconnected, merge it into existing disconnected state
        if (message.error && !message.connected && prev && !prev.connected) {
          return { ...prev, error: message.error }
        }
        return message
      })
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  if (bgState === null) {
    return (
      <div className="flex items-center justify-center h-12 text-[#52525b] text-xs">
        Loading...
      </div>
    )
  }

  return (
    <div className="w-[300px] p-4 bg-[#0a0a0a] text-white">
      <div className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#52525b] uppercase mb-3.5">
        nextslide.app
      </div>
      {bgState.connected && bgState.code
        ? <ConnectedView state={bgState} />
        : <DisconnectedView initialError={bgState.error} />
      }
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const container = document.getElementById('root')!
createRoot(container).render(<App />)
