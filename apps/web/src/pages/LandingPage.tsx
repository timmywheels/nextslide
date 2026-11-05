import React from 'react'
import { Button } from '../components/ui/button'
import logo from '../assets/logo.svg'

const REPO = 'https://github.com/timmywheels/nextslide'
const DOWNLOAD = `${REPO}/releases/latest`

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

function AppleIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.47 2.26-1.2 3.06-.78.86-2.08 1.52-3.13 1.44-.14-1.1.4-2.26 1.1-3.03.78-.86 2.1-1.49 3.23-1.47zM20.5 17.14c-.6 1.38-.9 2-1.68 3.2-1.08 1.65-2.6 3.7-4.5 3.72-1.68.02-2.12-1.1-4.4-1.08-2.28.01-2.76 1.1-4.45 1.08-1.9-.02-3.34-1.86-4.42-3.5C-1.98 15.93-.6 8.6 3.3 7.4c1.9-.58 3.5.5 4.68.5 1.17 0 3.03-1.23 5.2-.98.88.04 3.37.36 4.97 2.7-4.37 2.4-3.67 8.57 2.35 7.52z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage(): React.ReactElement {
  return (
    <div className="relative min-h-screen bg-white text-[#09090b]">
      {/* Acquisition banner */}
      <div className="relative z-10 bg-[#09090b] text-white text-xs text-center py-2 px-4">
        Hey Google — this should just be a native Slides feature.
      </div>

      <GridBackground />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <img src={logo} alt="nextslide.app" className="h-7 w-auto" />
        <nav className="flex items-center gap-5 text-sm text-[#a1a1aa]">
          <a href={DOWNLOAD} target="_blank" rel="noopener noreferrer" className="hover:text-[#09090b] transition-colors">
            Download
          </a>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-[#09090b] transition-colors">
            GitHub
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative max-w-4xl mx-auto px-6">
        <section className="flex flex-col items-center text-center pt-24 pb-20">
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-3 py-1 text-xs text-[#2d6a0a] mb-8 font-mono hover:bg-primary/15 transition-colors"
          >
            Google Slides · macOS · Open source
          </a>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            No more<br />
            <span className="font-serif italic font-normal text-[#52525b]">“…next slide, please.”</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#52525b] max-w-xl mb-10 leading-relaxed">
            Each time a speaker says “next slide,” it kills the vibe.
            Run the menu bar app on your Mac, share one link, and every speaker gets a Next button on their own phone. No accounts, nothing for them to install.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button
              size="lg"
              variant="green"
              onClick={() => window.open(DOWNLOAD, '_blank')}
              className="min-w-[220px] gap-2"
            >
              <AppleIcon />
              Download for macOS
            </Button>
            <a
              href={`${REPO}#macos-menu-bar-app`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#71717a] hover:text-[#09090b] transition-colors underline underline-offset-4"
            >
              or build from source →
            </a>
          </div>
          <p className="mt-4 text-xs text-[#a1a1aa] font-mono">macOS 14+ · Google Chrome · Signed &amp; notarized</p>
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
                title: 'Paste your Google Slides link',
                description:
                  'Open Nextslide from the menu bar and paste the deck link. It opens the presentation in its own window, ready to share in your meeting app.',
              },
              {
                step: '02',
                title: 'Share one invite link',
                description:
                  'Click Create invite link and drop it in the chat. Speakers open it on any phone or laptop, from any network. No app, no account.',
              },
              {
                step: '03',
                title: 'Allow one speaker at a time',
                description:
                  'Each speaker gets Next and Prev. Tap Allow beside whoever is up; everyone else is paused automatically. Commands land in under a blink.',
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
                q: 'What does the host need?',
                a: 'A Mac running macOS 14 or later with Google Chrome installed. Nextslide is a small menu bar app, signed and notarized with an Apple Developer ID. No browser extension, no server.',
              },
              {
                q: 'Which presentation tools does it support?',
                a: 'Google Slides is the primary target and runs in its own dedicated window. Keynote and PowerPoint work too, via keyboard control while the slideshow is in front.',
              },
              {
                q: 'Is the session secure?',
                a: 'Invite links carry a one-time token, speakers connect peer-to-peer over WebRTC when possible, and every session expires after four hours. Ending a session invalidates the link. No slide content ever leaves your Mac.',
              },
              {
                q: 'Who controls which speaker is active?',
                a: 'The host does. Tap Allow beside a speaker to hand them control; everyone else is paused automatically. Pause all or End session at any time.',
              },
              {
                q: 'Is it open source?',
                a: 'Yes — MIT licensed. The Swift app, the browser remote, and the legacy Chrome extension and relay server are all in one repository on GitHub.',
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

        {/* Open source */}
        <section className="border-t border-[#e4e4e7] py-16 text-center">
          <h2 className="text-lg font-semibold mb-3">Nothing to host</h2>
          <p className="text-[#71717a] text-sm mb-6 max-w-md mx-auto leading-relaxed">
            The menu bar app opens its own secure public tunnel for each session, so there is no server to run.
            Prefer the original Chrome extension and relay? It is still in the repo and self-hosts in one Docker container.
          </p>
          <a
            href={`${REPO}?tab=readme-ov-file#legacy-extension-workflow`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-[#a1a1aa] hover:text-[#09090b] transition-colors underline underline-offset-4"
          >
            View the legacy self-hosting guide →
          </a>
        </section>
      </main>

      <footer className="relative border-t border-[#e4e4e7] py-8 text-center text-xs text-[#a1a1aa]">
        nextslide.app — MIT licensed —{' '}
        <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-[#71717a] transition-colors">
          GitHub
        </a>
        {' '}—{' '}
        <a href="/privacy" className="hover:text-[#71717a] transition-colors">
          Privacy
        </a>
      </footer>
    </div>
  )
}
