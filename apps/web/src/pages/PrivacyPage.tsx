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
        <p className="m-legal-date">Effective November 6, 2026</p>

          <p className="m-legal-lead">
            Nextslide has no accounts, no analytics, and no servers that store session data. Sessions
            do rely on a few third-party services, listed below.
          </p>

          <section>
            <h2>What speakers share</h2>
            <p>
              A speaker enters a name to join. The name passes through Cloudflare to the host's Mac so
              the host can see who is waiting. The app keeps it in memory for the session and does not
              save it to a file. If the host allows notifications, macOS may also show the name in
              Notification Center. Sessions end when the host ends them or after four hours.
            </p>
            <p>
              The speaker's browser keeps the invite and a temporary session token until the tab is
              closed, so the speaker can reconnect.
            </p>
          </section>

          <section>
            <h2>What stays on the host's Mac</h2>
            <p>
              The app saves the most recent presentation link and a separate Chrome profile, which
              keeps the Google sign-in. If a connection fails, it writes technical details, including
              the temporary connection address, to a log file on the Mac. None of this is sent to
              Nextslide.
            </p>
            <p>
              The app opens and controls presentations on the Mac. It does not upload slides to
              Nextslide.
            </p>
          </section>

          <section>
            <h2>Third-party services</h2>
            <p>These services receive network information, such as IP addresses, when they are used:</p>
            <ul>
              <li>
                <strong>Cloudflare</strong> carries speaker connections, including names, through a
                temporary public tunnel. Slide commands also use the tunnel when a direct connection
                is not available. Cloudflare hosts this website and the update feed too.
              </li>
              <li>
                <strong>Google</strong> provides Google Slides and a connection service that helps
                speakers and hosts find a direct route. Signing in to Google is between you and Google.
              </li>
              <li>
                <strong>GitHub</strong> hosts app downloads and updates.
              </li>
            </ul>
            <p>
              Direct connections also reveal the host's and speaker's IP addresses to each other. Each
              service handles this data under its own privacy policy. Nextslide does not sell data.
            </p>
          </section>

          <section>
            <h2>Updates</h2>
            <p>
              The app checks for new versions about once a day. The check sends the app version, but
              no personal information or system profile.
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
