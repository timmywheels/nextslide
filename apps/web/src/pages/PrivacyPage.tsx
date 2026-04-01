import React from 'react'
import { Link } from 'react-router-dom'

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#09090b]">
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto border-b border-[#e4e4e7]">
        <Link to="/" className="font-mono font-bold text-lg tracking-tight hover:text-primary transition-colors">
          nextslide.app
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#a1a1aa] mb-12">Effective April 1, 2026</p>

        <div className="flex flex-col gap-10 text-[#52525b] leading-relaxed">
          <p className="text-base text-[#09090b]">
            nextslide does not collect, store, or share personal data.
          </p>

          <section>
            <h2 className="text-base font-semibold text-[#09090b] mb-2">What passes through the relay server</h2>
            <p>
              When a speaker joins a session, the name they enter is transmitted in real time through
              the relay server to display in the presenter's panel. Names are held in memory only for
              the duration of the session and are permanently deleted when the presenter disconnects
              or the session expires (within 4 hours of inactivity). No names or session data are
              written to disk or any database.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#09090b] mb-2">What the browser extension accesses</h2>
            <p>
              The extension detects whether the active browser tab is a Google Slides presentation
              and dispatches keyboard events to advance slides when a command is received from a
              speaker. No browsing history, tab content, or keystroke data is recorded or
              transmitted anywhere.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#09090b] mb-2">Local storage</h2>
            <p>
              The extension stores your preferred relay server URL and UI theme in your browser's
              local storage. This data never leaves your device.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#09090b] mb-2">Third parties</h2>
            <p>
              No data is sold, shared, or sent to any third party.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#09090b] mb-2">Contact</h2>
            <p>
              Questions or concerns? Open an issue at{' '}
              <a
                href="https://github.com/timmywheels/nextslide"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
              >
                github.com/timmywheels/nextslide
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#e4e4e7] py-8 text-center text-xs text-[#a1a1aa]">
        nextslide.app — MIT licensed —{' '}
        <a href="https://github.com/timmywheels/nextslide" target="_blank" rel="noopener noreferrer" className="hover:text-[#71717a] transition-colors">
          GitHub
        </a>
      </footer>
    </div>
  )
}
