import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { createSession } from '../lib/api'

// ---------------------------------------------------------------------------
// Topographic background
// ---------------------------------------------------------------------------

function TopoBackground(): React.ReactElement {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {/* Subtle green radial glow at top */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_0%,rgba(34,197,94,0.07)_0%,transparent_70%)]" />
      {/* Topographic contour lines — turbulence displaces ellipses into organic shapes */}
      <svg
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl opacity-[0.055]"
        viewBox="0 0 1000 680"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="topo" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.011 0.007"
              numOctaves="5"
              seed="12"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="45" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter="url(#topo)">
          {Array.from({ length: 22 }).map((_, i) => (
            <ellipse
              key={i}
              cx="500"
              cy="250"
              rx={45 + i * 36}
              ry={28 + i * 22}
              stroke="white"
              strokeWidth={i < 4 ? 0.9 : 0.6}
              fill="none"
            />
          ))}
        </g>
      </svg>
      {/* Fade out edges so texture doesn't bleed into footer */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(to_bottom,transparent,#0a0a0a)]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
    } catch {
      setError('Could not create session. Is the server running?')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <TopoBackground />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="font-mono font-bold text-lg tracking-tight">nextslide.app</span>
        <a href="#" className="text-sm text-[#52525b] hover:text-white transition-colors">
          GitHub
        </a>
      </header>

      {/* Hero */}
      <main className="relative max-w-4xl mx-auto px-6">
        <section className="flex flex-col items-center text-center pt-24 pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/25 bg-[#22c55e]/8 px-3 py-1 text-xs text-[#22c55e] mb-8 font-mono">
            Open source · MIT · Self-hostable
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            No more{' '}
            <span className="italic text-[#52525b]">"next slide please."</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#71717a] max-w-xl mb-10 leading-relaxed">
            Let your speakers advance your Google Slides from their phone.
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
              onClick={() => window.open('#', '_blank')}
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
          <h2 className="text-center text-sm font-mono uppercase tracking-widest text-[#52525b] mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                step: '01',
                title: 'Install the extension',
                description:
                  'Add the nextslide.app Chrome extension once. It stays in the background until you need it.',
              },
              {
                step: '02',
                title: 'Start a session & share',
                description:
                  'Click "Start a session" to get a QR code and link. Share it with your speakers before you begin.',
              },
              {
                step: '03',
                title: 'Speakers tap Next',
                description:
                  'Anyone with your link can advance the slides from their own device — no install required.',
              },
            ].map(({ step, title, description }) => (
              <div
                key={step}
                className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] p-6 flex flex-col gap-3 hover:border-[#2f2f2f] transition-colors"
              >
                <span className="font-mono text-xs text-[#3f3f46]">{step}</span>
                <h3 className="font-semibold text-white text-sm">{title}</h3>
                <p className="text-sm text-[#52525b] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Self-host */}
        <section className="border-t border-[#1a1a1a] py-16 text-center">
          <h2 className="text-lg font-semibold mb-3">Self-host in under 5 minutes</h2>
          <p className="text-[#52525b] text-sm mb-6 max-w-md mx-auto leading-relaxed">
            Run nextslide.app on your own infrastructure with a single Docker container.
            No data ever leaves your environment.
          </p>
          <a
            href="#"
            className="text-sm text-[#3f3f46] hover:text-white transition-colors underline underline-offset-4"
          >
            View self-hosting guide →
          </a>
        </section>
      </main>

      <footer className="relative border-t border-[#1a1a1a] py-8 text-center text-xs text-[#3f3f46]">
        nextslide.app — MIT licensed —{' '}
        <a href="#" className="hover:text-[#71717a] transition-colors">
          GitHub
        </a>
      </footer>
    </div>
  )
}
