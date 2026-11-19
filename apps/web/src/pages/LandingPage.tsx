import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { SlideButton } from '../components/SlideButton'
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
  { q: 'Is it open source?', a: 'Yes. The Mac app and the speaker remote are MIT licensed and live in one repository.' },
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

const deck = [
  { title: 'Quarterly review', body: 'Three speakers, one deck' },
  { title: 'Product', body: 'Shipped on time' },
  { title: 'Growth', bars: [38, 56, 72, 94] },
  { title: 'Thanks', body: 'Questions?' },
]

function DemoSlide({ index, className, onAnimationEnd }: { index: number; className: string; onAnimationEnd?: () => void }): React.ReactElement {
  const { title, body, bars } = deck[index]
  return (
    <div className={`m-slide ${className}`} onAnimationEnd={onAnimationEnd}>
      <strong>{title}</strong>
      {body && <span>{body}</span>}
      {bars && <div className="m-slide-bars">{bars.map(height => <i key={height} style={{ height: `${height}%` }} />)}</div>}
    </div>
  )
}

/** Plays the real speaker button against a small sample deck. It sends nothing. */
function RemotePreview(): React.ReactElement {
  const [slide, setSlide] = useState(0)
  const [turn, setTurn] = useState<{ id: number; from: number; direction: 'next' | 'prev' } | null>(null)
  const [pressed, setPressed] = useState(false)

  function go(direction: 'next' | 'prev') {
    setPressed(true)
    setTurn(current => ({ id: (current?.id ?? 0) + 1, from: slide, direction }))
    setSlide((slide + (direction === 'next' ? 1 : deck.length - 1)) % deck.length)
  }

  return (
    <div className={`m-demo ${pressed ? '' : 'is-waiting'}`}>
      <div className="m-screen" role="status" aria-label={`Sample slide ${slide + 1} of ${deck.length}: ${deck[slide].title}`}>
        {turn && <DemoSlide key={`out-${turn.id}`} index={turn.from} className={`is-leaving-${turn.direction}`} onAnimationEnd={() => setTurn(null)} />}
        <DemoSlide key={`in-${turn?.id ?? slide}`} index={slide} className={turn ? `is-entering-${turn.direction}` : ''} />
        <div className="m-screen-dots" aria-hidden="true">{deck.map(({ title }, index) => <i key={title} className={index === slide ? 'is-current' : ''} />)}</div>
      </div>
      <div className="m-phone">
        <div className="m-phone-bar">
          <span><img src="/icons/nextslide.svg" alt="" width="18" height="18" />Nextslide</span>
          <small><i />Ready</small>
        </div>
        <p className="m-phone-name">Priya</p>
        <p className="m-phone-title">Slide controls</p>
        <SlideButton direction="next" label="Next slide" className="m-phone-next" iconSize={46} strokeWidth={1.5} onPress={() => go('next')} />
        <SlideButton direction="prev" label="Previous slide" className="m-phone-prev" iconSize={16} onPress={() => go('prev')} />
      </div>
      <p className="m-demo-hint">Try it. This is what speakers get.</p>
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
          <p>The Mac app opens its own public tunnel for each session, so there is no server to run.</p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  )
}
