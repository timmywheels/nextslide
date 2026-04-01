import React from 'react'
import { Button } from '../components/ui/button'
import logo from '../assets/logo.svg'

// ---------------------------------------------------------------------------
// Square grid background — inspired by promptwatch.com
// ---------------------------------------------------------------------------

function GridBackground(): React.ReactElement {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {/* Square grid: 160×160px cells, 1px lines at rgba(0,0,0,0.06) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right,  rgba(0,0,0,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '160px 160px',
        }}
      />
      {/* Radial gradient overlay: clears center so hero sits on clean white */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 70% 55% at 50% 35%, #ffffff 25%, transparent 75%)',
        }}
      />
      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(to_bottom,transparent,#ffffff)]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage(): React.ReactElement {
  return (
    <div className="relative min-h-screen bg-white text-[#09090b]">
      <GridBackground />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <img src={logo} alt="nextslide.app" className="h-7 w-auto" />
        <a href="https://github.com/timmywheels/nextslide" target="_blank" rel="noopener noreferrer" className="text-sm text-[#a1a1aa] hover:text-[#09090b] transition-colors">
          GitHub
        </a>
      </header>

      {/* Hero */}
      <main className="relative max-w-4xl mx-auto px-6">
        <section className="flex flex-col items-center text-center pt-24 pb-20">
          <a
            href="https://github.com/timmywheels/nextslide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-3 py-1 text-xs text-[#2d6a0a] mb-8 font-mono hover:bg-primary/15 transition-colors"
          >
            Google Slides · Chrome · Open source
          </a>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            No more<br />
            <span className="font-serif italic text-[#52525b]" style={{ fontWeight: 300 }}>"...next slide, please."</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#52525b] max-w-xl mb-10 leading-relaxed">
            Each time a speaker says "next slide," it kills the vibe.
            Install the Chrome extension once, then share a link — every speaker gets a Next button on their device, no account required.
          </p>

          <Button
            size="lg"
            variant="green"
            onClick={() => window.open('https://github.com/timmywheels/nextslide', '_blank')}
            className="min-w-[200px] gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0" aria-hidden="true">
              <path fill="#4caf50" d="M44,24c0,11.044-8.956,20-20,20S4,35.044,4,24S12.956,4,24,4S44,12.956,44,24z"/>
              <path fill="#ffc107" d="M24,4v20l8,4l-8.843,16c0.317,0,0.526,0,0.843,0c11.053,0,20-8.947,20-20S35.053,4,24,4z"/>
              <path fill="#4caf50" d="M44,24c0,11.044-8.956,20-20,20S4,35.044,4,24S12.956,4,24,4S44,12.956,44,24z"/>
              <path fill="#ffc107" d="M24,4v20l8,4l-8.843,16c0.317,0,0.526,0,0.843,0c11.053,0,20-8.947,20-20S35.053,4,24,4z"/>
              <path fill="#f44336" d="M41.84,15H24v13l-3-1L7.16,13.26H7.14C10.68,7.69,16.91,4,24,4C31.8,4,38.55,8.48,41.84,15z"/>
              <path fill="#dd2c00" d="M7.158,13.264l8.843,14.862L21,27L7.158,13.264z"/>
              <path fill="#558b2f" d="M23.157,44l8.934-16.059L28,25L23.157,44z"/>
              <path fill="#f9a825" d="M41.865,15H24l-1.579,4.58L41.865,15z"/>
              <path fill="#fff" d="M33,24c0,4.969-4.031,9-9,9s-9-4.031-9-9s4.031-9,9-9S33,19.031,33,24z"/>
              <path fill="#2196f3" d="M31,24c0,3.867-3.133,7-7,7s-7-3.133-7-7s3.133-7,7-7S31,20.133,31,24z"/>
            </svg>
            Install the extension →
          </Button>
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
                  'One-time setup. Add the Chrome extension, open your Google Slides presentation, and start a session in one click.',
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
                <span className="font-mono text-xs text-[#a1a1aa]">{step}</span>
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
