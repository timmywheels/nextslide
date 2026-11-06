import React from 'react'
import { MarketingFooter, MarketingHeader } from './LandingPage'
import './marketing.css'

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="marketing">
      <MarketingHeader />
      <main className="m-main">
        <article className="m-legal">
        <h1>Privacy Policy</h1>
        <p className="m-legal-date">Effective April 1, 2026</p>

          <p className="m-legal-lead">
            nextslide does not collect, store, or share personal data.
          </p>

          <section>
            <h2>What passes through the relay server</h2>
            <p>
              When a speaker joins a session, the name they enter is transmitted in real time through
              the relay server to display in the presenter's panel. Names are held in memory only for
              the duration of the session and are permanently deleted when the presenter disconnects
              or the session expires (within 4 hours of inactivity). No names or session data are
              written to disk or any database.
            </p>
          </section>

          <section>
            <h2>What the browser extension accesses</h2>
            <p>
              The extension detects whether the active browser tab is a Google Slides presentation
              and dispatches keyboard events to advance slides when a command is received from a
              speaker. No browsing history, tab content, or keystroke data is recorded or
              transmitted anywhere.
            </p>
          </section>

          <section>
            <h2>Local storage</h2>
            <p>
              The extension stores your preferred relay server URL and UI theme in your browser's
              local storage. This data never leaves your device.
            </p>
          </section>

          <section>
            <h2>Third parties</h2>
            <p>
              No data is sold, shared, or sent to any third party.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions or concerns? Open an issue at{' '}
              <a href="https://github.com/timmywheels/nextslide">
                github.com/timmywheels/nextslide
              </a>
              .
            </p>
          </section>
        </article>
      </main>
      <MarketingFooter />
    </div>
  )
}
