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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_0%,rgba(34,197,94,0.06)_0%,transparent_70%)]" />
      {/* Topographic contour lines */}
      <svg
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl opacity-[0.12]"
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
              stroke="#09090b"
              strokeWidth={i < 4 ? 0.9 : 0.6}
              fill="none"
            />
          ))}
        </g>
      </svg>
      {/* Fade out edges */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(to_bottom,transparent,#fafafa)]" />
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
    <div className="relative min-h-screen bg-[#fafafa] text-[#09090b]">
      <TopoBackground />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="font-mono font-bold text-lg tracking-tight">nextslide.app</span>
        <a href="https://github.com/timmywheels/nextslide" target="_blank" rel="noopener noreferrer" className="text-sm text-[#a1a1aa] hover:text-[#09090b] transition-colors">
          GitHub
        </a>
      </header>

      {/* Hero */}
      <main className="relative max-w-4xl mx-auto px-6">
        <section className="flex flex-col items-center text-center pt-24 pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs text-primary mb-8 font-mono">
            Open source · MIT · Self-hostable
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            No more<br />
            <span className="italic text-[#c4c4c7]">"next slide, please."</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#52525b] max-w-xl mb-10 leading-relaxed">
            One person at the laptop keeps things tidy. "Next slide, please" doesn't.
            nextslide gives each speaker a Next button on their phone — no app, no account.
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
              onClick={() => window.open('https://github.com/timmywheels/nextslide', '_blank')}
              className="text-[#09090b] border-[#d4d4d8] hover:bg-[#f4f4f5]"
            >
              Install extension
            </Button>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-500">{error}</p>
          )}
        </section>

        {/* How it works */}
        <section className="pb-24">
          <h2 className="text-center text-sm font-mono uppercase tracking-widest text-[#a1a1aa] mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                step: '01',
                title: 'Presenter installs the extension',
                description:
                  'One-time setup. Add the Chrome extension, open your slides, and start a session in one click.',
              },
              {
                step: '02',
                title: 'Share a link with your speakers',
                description:
                  'The extension generates a session code and shareable link. Drop it in Slack, email it, or show the QR code — all speakers join the same session.',
              },
              {
                step: '03',
                title: 'Speakers control slides from their device',
                description:
                  'Speakers advance their own slides from any phone or laptop. No app, no account, no friction.',
              },
            ].map(({ step, title, description }) => (
              <div
                key={step}
                className="rounded-xl border border-[#e4e4e7] bg-white p-6 flex flex-col gap-3 hover:border-[#d4d4d8] transition-colors"
              >
                <span className="font-mono text-xs text-[#d4d4d8]">{step}</span>
                <h3 className="font-semibold text-[#09090b] text-sm">{title}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#e4e4e7] pb-24 pt-16">
          <h2 className="text-center text-sm font-mono uppercase tracking-widest text-[#a1a1aa] mb-10">
            FAQ
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              {
                q: 'Do speakers need to install anything?',
                a: 'No. They open a link on any phone or laptop. No app download, no account, no sign-in — just a Next and Prev button.',
              },
              {
                q: 'Which presentation tools does it support?',
                a: 'Google Slides via the Chrome extension. Under the hood it sends a keypress, so anything that responds to arrow keys works too.',
              },
              {
                q: 'Is the session secure?',
                a: 'Sessions are ephemeral — they live in memory for up to 4 hours, then vanish. The relay server sees only a session code and slide commands. No slide content ever touches the server.',
              },
              {
                q: 'Who controls which speaker is active?',
                a: "The presenter does. The extension panel lets you enable or disable each speaker individually, so only the current speaker can advance slides.",
              },
              {
                q: 'Can I self-host it?',
                a: 'Yes — it\'s MIT licensed. Run it on a $5 VPS, inside a corporate network, or deploy to Railway in one click. No database to provision.',
              },
              {
                q: 'What if the presenter disconnects?',
                a: 'The session ends and all speakers are disconnected. Starting a new session takes one click from the extension.',
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl border border-[#e4e4e7] bg-white p-5 flex flex-col gap-2 hover:border-[#d4d4d8] transition-colors"
              >
                <h3 className="font-semibold text-[#09090b] text-sm">{q}</h3>
                <p className="text-sm text-[#71717a] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Self-host */}
        <section className="border-t border-[#e4e4e7] py-16 text-center">
          <h2 className="text-lg font-semibold mb-3">Self-host in under 5 minutes</h2>
          <p className="text-[#71717a] text-sm mb-6 max-w-md mx-auto leading-relaxed">
            Run nextslide.app on your own infrastructure with a single Docker container.
            No data ever leaves your environment.
          </p>
          <a
            href="https://github.com/timmywheels/nextslide?tab=readme-ov-file#self-hosting" target="_blank" rel="noopener noreferrer"
            className="text-sm text-[#a1a1aa] hover:text-[#09090b] transition-colors underline underline-offset-4"
          >
            View self-hosting guide →
          </a>
        </section>
      </main>

      <footer className="relative border-t border-[#e4e4e7] py-8 text-center text-xs text-[#a1a1aa]">
        nextslide.app — MIT licensed —{' '}
        <a href="https://github.com/timmywheels/nextslide" target="_blank" rel="noopener noreferrer" className="hover:text-[#71717a] transition-colors">
          GitHub
        </a>
      </footer>
    </div>
  )
}
