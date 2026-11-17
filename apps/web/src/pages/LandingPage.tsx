import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Download } from 'lucide-react'
import './marketing.css'

const REPO = 'https://github.com/timmywheels/nextslide'
const DOWNLOAD = `${REPO}/releases/latest/download/Nextslide.dmg`

const steps = [
  { title: 'Paste your Google Slides link', body: 'Open Nextslide from the menu bar and paste the link. Your deck opens in its own window, ready to share in your meeting app.' },
  { title: 'Share one invite link', body: 'Create an invite and drop it in the chat. Speakers open it on any phone or laptop, from any network.' },
  { title: 'Allow one speaker at a time', body: 'Select Allow beside whoever is up. Everyone else pauses automatically, so only one person controls the slides.' },
]

const questions = [
  { q: 'Do speakers need to install anything?', a: 'No. They open a link in their browser and enter a name. There is no app and no account.' },
  { q: 'What does the host need?', a: 'A Mac running macOS 14 or later with Google Chrome installed. Nextslide is a menu bar app signed with an Apple Developer ID.' },
  { q: 'Which presentation tools work?', a: 'Google Slides runs in its own window and keeps working while you use other apps. Keynote and PowerPoint work while the slideshow stays in front.' },
  { q: 'Is a session secure?', a: 'Each session has its own secret invite link. Ending the session invalidates that link, and sessions expire after four hours.' },
  { q: 'Who decides which speaker is active?', a: 'The host does. Allow one speaker, pause everyone, or end the session at any time from the menu bar.' },
  { q: 'Is it open source?', a: 'Yes. The Mac app, the speaker remote, and the original Chrome extension are MIT licensed and live in one repository.' },
]

export function MarketingHeader(): React.ReactElement {
  return (
    <header className="m-header">
      <Link to="/" className="m-brand"><img src="/icons/nextslide.svg" alt="" width="26" height="26" />Nextslide</Link>
      <nav className="m-nav" aria-label="Main">
        <a href={DOWNLOAD}>Download</a>
        <a href={REPO}>GitHub</a>
      </nav>
    </header>
  )
}

export function MarketingFooter(): React.ReactElement {
  return (
    <footer className="m-footer">
      <span>Nextslide · MIT licensed</span>
      <nav aria-label="Footer">
        <a href={REPO}>GitHub</a>
        <Link to="/privacy">Privacy</Link>
      </nav>
    </footer>
  )
}

function RemotePreview(): React.ReactElement {
  return (
    <div className="m-phone" aria-hidden="true">
      <div className="m-phone-bar">
        <span><img src="/icons/nextslide.svg" alt="" width="18" height="18" />Nextslide</span>
        <small><i />Ready</small>
      </div>
      <p className="m-phone-name">Priya</p>
      <p className="m-phone-title">Slide controls</p>
      <div className="m-phone-next"><ArrowRight size={46} strokeWidth={1.5} />Next slide</div>
      <div className="m-phone-prev"><ArrowLeft size={16} />Previous slide</div>
    </div>
  )
}

export default function LandingPage(): React.ReactElement {
  return (
    <div className="marketing">
      <div className="m-banner">Hey Google, this should just be a native Slides feature.</div>
      <MarketingHeader />
      <main className="m-main">
        <section className="m-hero">
          <div>
            <h1>No more <em>“…next slide, please.”</em></h1>
            <p className="m-lede">Run Nextslide on your Mac and share one link. Each speaker gets their own Next button, with nothing to install and no account.</p>
            <div className="m-actions">
              <a className="m-button" href={DOWNLOAD}><Download size={18} aria-hidden="true" />Download for macOS</a>
              <a className="m-link" href={`${REPO}#build-from-source`}>Build from source</a>
            </div>
            <p className="m-note">macOS 14 or later. Requires Google Chrome.</p>
          </div>
          <RemotePreview />
        </section>

        <section className="m-section">
          <h2>How it works</h2>
          <ol className="m-steps">
            {steps.map(({ title, body }, index) => (
              <li key={title}><span>{index + 1}</span><h3>{title}</h3><p>{body}</p></li>
            ))}
          </ol>
        </section>

        <section className="m-section">
          <h2>Questions</h2>
          <div className="m-faq">
            {questions.map(({ q, a }) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}
          </div>
        </section>

        <section className="m-section m-closing">
          <h2>Nothing to host</h2>
          <p>The Mac app opens its own public tunnel for each session, so there is no server to run. The original Chrome extension and relay remain in the repository for self-hosting.</p>
          <a className="m-link" href={`${REPO}#legacy-extension-workflow`}>Read the self-hosting guide</a>
        </section>
      </main>
      <MarketingFooter />
    </div>
  )
}
