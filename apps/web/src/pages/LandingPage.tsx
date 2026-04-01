import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { createSession } from '../lib/api'

export default function LandingPage(): React.ReactElement {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStartSession(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const session = await createSession()
      void navigate(`/presenter/${session.code}`)
    } catch (err) {
      setError('Could not create session. Is the server running?')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a', color: '#fafafa' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] max-w-6xl mx-auto">
        <span className="font-mono font-bold text-lg tracking-tight">nextslide</span>
        <a
          href="#"
          className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
        >
          GitHub
        </a>
      </header>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6">
        <section className="flex flex-col items-center text-center pt-24 pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-xs text-[#22c55e] mb-8 font-mono">
            Open source · MIT · Self-hostable
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-tight mb-6">
            No more{' '}
            <span className="italic text-[#a1a1aa]">"next slide please."</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#a1a1aa] max-w-2xl mb-10 leading-relaxed">
            Audience members control your Google Slides presentation from their phone.
            No app install. No signup. Just share a link.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              size="lg"
              variant="green"
              onClick={() => void handleStartSession()}
              disabled={loading}
              className="min-w-[180px]"
            >
              {loading ? 'Creating session…' : 'Start a session'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                window.open('#', '_blank')
              }}
            >
              Install extension
            </Button>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}
        </section>

        {/* How it works */}
        <section className="pb-24">
          <h2 className="text-center text-2xl font-semibold mb-12">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Install the extension',
                description:
                  'Add the nextslide Chrome extension once. It stays in the background until you need it.',
              },
              {
                step: '2',
                title: 'Start a session & share',
                description:
                  'Click "Start a session" to get a QR code and link. Display it on your slides or share the URL.',
              },
              {
                step: '3',
                title: 'Audience taps Next',
                description:
                  'Anyone with your link can advance your slides from their phone — no install required.',
              },
            ].map(({ step, title, description }) => (
              <div
                key={step}
                className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-6 flex flex-col gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-[#22c55e]/20 text-[#22c55e] text-sm font-bold flex items-center justify-center font-mono">
                  {step}
                </div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="text-sm text-[#a1a1aa] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Self-host */}
        <section className="border-t border-[#1f1f1f] py-16 text-center">
          <h2 className="text-xl font-semibold mb-3">Self-host in under 5 minutes</h2>
          <p className="text-[#a1a1aa] text-sm mb-6 max-w-lg mx-auto">
            Run nextslide on your own infrastructure with a single Docker container.
            No data ever leaves your environment.
          </p>
          <a
            href="#"
            className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-white transition-colors underline underline-offset-4"
          >
            View self-hosting guide on GitHub
          </a>
        </section>
      </main>

      <footer className="border-t border-[#1f1f1f] py-8 text-center text-xs text-[#52525b]">
        nextslide.app — MIT licensed —{' '}
        <a href="#" className="hover:text-[#a1a1aa] transition-colors">
          GitHub
        </a>
      </footer>
    </div>
  )
}
