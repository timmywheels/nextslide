import './index.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

const DEFAULT_RELAY_URL = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? 'wss://nextslide.app'

function OptionsApp(): React.ReactElement {
  const [relayUrl, setRelayUrl] = React.useState<string>('')
  const [saved, setSaved] = React.useState(false)

  // Load saved value on mount
  React.useEffect(() => {
    chrome.storage.sync.get(['relayUrl'], (result) => {
      setRelayUrl((result.relayUrl as string | undefined) ?? '')
    })
  }, [])

  function handleSave(): void {
    const val = relayUrl.trim()
    const urlToStore = val || DEFAULT_RELAY_URL
    chrome.storage.sync.set({ relayUrl: urlToStore }, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="w-[360px] bg-[#0a0a0a] min-h-screen p-5 text-white">
      <div className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#52525b] uppercase mb-5">
        nextslide.app
      </div>

      <h1 className="text-base font-semibold mb-4">Settings</h1>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="relay-url"
          className="text-[11px] font-semibold uppercase tracking-wider text-[#71717a]"
        >
          Relay server URL
        </label>
        <Input
          id="relay-url"
          type="text"
          spellCheck={false}
          placeholder={DEFAULT_RELAY_URL}
          value={relayUrl}
          onChange={e => setRelayUrl(e.target.value)}
        />
        <p className="text-[11px] text-[#52525b] mt-0.5">
          Leave blank to use the default. For self-hosting, enter your own server URL.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="green" className="w-full" onClick={handleSave}>
          Save
        </Button>
        {saved && (
          <div className="text-xs text-primary text-center">Saved!</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const container = document.getElementById('root')!
createRoot(container).render(<OptionsApp />)
