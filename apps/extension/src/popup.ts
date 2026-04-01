import type { Participant } from '@nextslide/types'

const app = document.getElementById('app')!

type BackgroundState = {
  connected: boolean
  code: string | null
  participants: Participant[]
  error?: string | null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getSavedName(): string {
  return localStorage.getItem('nextslide_presenter_name') ?? ''
}

function renderConnected(state: BackgroundState): void {
  const audience = (state.participants ?? []).filter(p => p.role === 'audience')

  app.innerHTML = `
    <div style="text-align:center;margin-bottom:10px">
      <div><span class="dot"></span><span class="live-label">Live</span></div>
      <div class="session-code">${esc(state.code ?? '')}</div>
    </div>

    <div class="audience-section">
      <div class="section-label">Audience (${audience.length})</div>
      ${audience.length === 0
        ? '<div class="empty-audience">No one yet — share the code!</div>'
        : `<div class="participant-list">${audience.map(p => `
            <div class="participant">
              <span class="participant-dot" style="background:#3b82f6"></span>
              <span>${esc(p.name)}</span>
            </div>`).join('')}
          </div>`
      }
    </div>

    <div style="margin-top:10px">
      <button class="btn btn-ghost" id="disconnect">End session</button>
    </div>
  `

  document.getElementById('disconnect')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'disconnect' })
  })
}

function renderDisconnected(state: BackgroundState): void {
  const savedName = getSavedName()

  app.innerHTML = `
    <div class="stack">
      <input class="input" id="name" placeholder="Your name" maxlength="32" value="${esc(savedName)}" />

      <button class="btn btn-green" id="start">Start session</button>

      <div class="divider">or join with code</div>

      <div class="row">
        <input class="input code-input" id="code" placeholder="ABC123" maxlength="6" />
        <button class="btn btn-blue" id="join" style="width:auto;padding:10px 16px">Join</button>
      </div>

      <div id="status"></div>
      ${state.error ? `<div style="color:#ef4444;font-size:12px">${esc(state.error)}</div>` : ''}
    </div>
  `

  const nameInput = document.getElementById('name') as HTMLInputElement
  const codeInput = document.getElementById('code') as HTMLInputElement
  const status = document.getElementById('status')!

  chrome.storage.local.get(['lastCode'], (r) => {
    if (r['lastCode'] && !codeInput.value) codeInput.value = r['lastCode'] as string
  })

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  })

  document.getElementById('start')!.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (name) localStorage.setItem('nextslide_presenter_name', name)
    status.textContent = 'Starting…'
    status.style.color = '#71717a'
    chrome.runtime.sendMessage({ type: 'startSession', name: name || undefined }, (res: { code?: string; error?: string }) => {
      if (res?.error) {
        status.textContent = res.error
        status.style.color = '#ef4444'
      }
    })
  })

  document.getElementById('join')!.addEventListener('click', () => {
    const code = codeInput.value.trim()
    const name = nameInput.value.trim()
    if (code.length !== 6) { status.textContent = 'Enter a 6-character code'; return }
    if (name) localStorage.setItem('nextslide_presenter_name', name)
    chrome.storage.local.set({ lastCode: code })
    chrome.runtime.sendMessage({ type: 'connect', code, name: name || undefined })
    status.textContent = 'Connecting…'
    status.style.color = '#71717a'
  })
}

function render(state: BackgroundState): void {
  if (state.connected && state.code) {
    renderConnected(state)
  } else {
    renderDisconnected(state)
  }
}

chrome.runtime.sendMessage({ type: 'getState' }, (response: BackgroundState) => {
  render(response ?? { connected: false, code: null, participants: [] })
})

chrome.runtime.onMessage.addListener((message: BackgroundState) => {
  if (message.error && !message.connected) {
    const status = document.getElementById('status')
    if (status) {
      status.textContent = message.error
      status.style.color = '#ef4444'
      return
    }
  }
  render(message)
})
