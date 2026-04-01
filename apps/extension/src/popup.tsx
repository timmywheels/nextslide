import './index.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Settings, Sun, Moon } from 'lucide-react'
import type { Participant } from '@nextslide/types'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

const WEB_URL = (import.meta.env.VITE_WEB_URL as string | undefined) ?? 'https://nextslide.app'
const THEME_KEY = 'nextslide_theme'

type Theme = 'dark' | 'light'

// ---------------------------------------------------------------------------
// Theme hook
// ---------------------------------------------------------------------------

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = React.useState<Theme>('dark')

  React.useEffect(() => {
    chrome.storage.sync.get([THEME_KEY], (r) => {
      setTheme((r[THEME_KEY] as Theme | undefined) ?? 'dark')
    })
  }, [])

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    void chrome.storage.sync.set({ [THEME_KEY]: next })
  }

  return [theme, toggle]
}

interface BackgroundState {
  connected: boolean
  code: string | null
  participants: Participant[]
  error?: string | null
}

// ---------------------------------------------------------------------------
// Connected view
// ---------------------------------------------------------------------------

function ConnectedView({ state }: { state: BackgroundState }): React.ReactElement {
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

  function openManager(): void {
    const managerUrl = chrome.runtime.getURL('manager.html')
    chrome.tabs.query({ url: managerUrl }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        void chrome.tabs.update(tabs[0].id, { active: true })
        if (tabs[0].windowId !== undefined) {
          void chrome.windows.update(tabs[0].windowId, { focused: true })
        }
      } else {
        void chrome.tabs.create({ url: managerUrl })
      }
    })
  }

  function endSession(): void {
    chrome.runtime.sendMessage({ type: 'disconnect' })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Live indicator + code */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-primary">Live</span>
        </div>
        <div className="font-mono text-3xl font-bold tracking-[0.2em] text-ns-fg">{code}</div>
        <Button
          variant="ghost" size="sm" onClick={copyLink}
          className="mt-0.5 border border-ns-dimmer text-ns-muted text-xs px-3 py-1 h-auto hover:border-ns-fg hover:text-ns-fg"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>

      {/* Speakers */}
      <div className="bg-ns-surface border border-ns-border rounded-lg px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ns-faint mb-1.5">
          Speakers ({speakers.length})
        </div>
        {speakers.length === 0 ? (
          <div className="text-xs text-ns-dimmer italic">No one yet — share the link!</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
            {speakers.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-ns-fg">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="ghost" size="sm" onClick={openManager}
        className="w-full border border-ns-dimmer text-ns-muted text-xs hover:border-ns-fg hover:text-ns-fg"
      >
        Open manager →
      </Button>

      <Button
        variant="ghost" size="sm" onClick={endSession}
        className="w-full border border-ns-dimmer text-ns-muted text-xs hover:border-red-500 hover:text-red-400"
      >
        End session
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disconnected view
// ---------------------------------------------------------------------------

function DisconnectedView({ initialError }: { initialError?: string | null }): React.ReactElement {
  const [name, setName] = React.useState(() => localStorage.getItem('nextslide_presenter_name') ?? '')
  const [code, setCode] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [statusIsError, setStatusIsError] = React.useState(false)
  const [error, setError] = React.useState<string | null>(initialError ?? null)

  React.useEffect(() => {
    chrome.storage.local.get(['lastCode'], (r) => {
      if (r['lastCode'] && !code) setCode(r['lastCode'] as string)
    })
  }, [])

  function handleStart(): void {
    const trimmedName = name.trim()
    if (trimmedName) localStorage.setItem('nextslide_presenter_name', trimmedName)
    setStatus('Starting\u2026')
    setStatusIsError(false)
    chrome.runtime.sendMessage(
      { type: 'startSession', name: trimmedName || undefined },
      (res: { code?: string; error?: string }) => {
        if (res?.error) { setStatus(res.error); setStatusIsError(true) }
      }
    )
  }

  function handleJoin(): void {
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (trimmedCode.length !== 6) { setStatus('Enter a 6-character code'); setStatusIsError(true); return }
    if (trimmedName) localStorage.setItem('nextslide_presenter_name', trimmedName)
    chrome.storage.local.set({ lastCode: trimmedCode })
    chrome.runtime.sendMessage({ type: 'connect', code: trimmedCode, name: trimmedName || undefined })
    setStatus('Connecting\u2026')
    setStatusIsError(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Your name" maxLength={32} value={name} onChange={e => setName(e.target.value)} />
      <Button variant="green" className="w-full" onClick={handleStart}>Start session</Button>

      <div className="flex items-center gap-2 my-1 text-ns-dimmer text-[11px]">
        <span className="flex-1 h-px bg-ns-border" />
        or join with code
        <span className="flex-1 h-px bg-ns-border" />
      </div>

      <div className="flex gap-2 items-stretch">
        <Input
          placeholder="ABC123" maxLength={6} value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          className="text-center text-xl tracking-widest uppercase flex-1"
        />
        <Button variant="outline" onClick={handleJoin} className="shrink-0 px-4">Join</Button>
      </div>

      {status && (
        <div className={`text-xs mt-0.5 ${statusIsError ? 'text-red-500' : 'text-ns-subtle'}`}>{status}</div>
      )}
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------

function App(): React.ReactElement {
  const [bgState, setBgState] = React.useState<BackgroundState | null>(null)
  const [theme, toggleTheme] = useTheme()

  React.useEffect(() => {
    chrome.runtime.sendMessage({ type: 'getState' }, (response: BackgroundState) => {
      setBgState(response ?? { connected: false, code: null, participants: [] })
    })
    const listener = (message: BackgroundState): void => {
      setBgState(prev => {
        if (message.error && !message.connected && prev && !prev.connected) return { ...prev, error: message.error }
        return message
      })
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  function openSettings(): void { void chrome.runtime.openOptionsPage() }

  if (bgState === null) {
    return (
      <div className="w-[300px] p-4 bg-ns-bg flex items-center justify-center h-12 text-ns-faint text-xs">
        Loading...
      </div>
    )
  }

  return (
    <div className={`w-[300px] p-4 bg-ns-bg text-ns-fg ${theme === 'light' ? 'ns-light' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-ns-faint uppercase">
          nextslide.app
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="text-ns-subtle hover:text-ns-fg transition-colors p-0.5"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            onClick={openSettings}
            className="text-ns-subtle hover:text-ns-fg transition-colors p-0.5"
            aria-label="Settings"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {bgState.connected && bgState.code
        ? <ConnectedView state={bgState} />
        : <DisconnectedView initialError={bgState.error} />
      }
    </div>
  )
}

const container = document.getElementById('root')!
createRoot(container).render(<App />)
