import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserControl, presentationURL } from '../src/browser-control'
import { ChromePipe, type ChromeEvent } from '../src/chrome-pipe'

const fixture = `<title>Test deck - Google Slides</title><div class="punch-viewer-page-wrapper" style="width:800px;height:500px">Slide <span id="slide">1</span></div><script>document.addEventListener('keydown', event => { if (event.key === 'ArrowRight') document.querySelector('#slide').textContent = String(Number(document.querySelector('#slide').textContent) + 1); });</script>`
async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000
  while (!await check()) { if (Date.now() > deadline) throw new Error('Timed out waiting for presentation'); await new Promise(resolve => setTimeout(resolve, 30)) }
}

test('only Google Slides links open a presentation', () => {
  assert.deepEqual(presentationURL(' https://docs.google.com/presentation/d/deck_123/edit?usp=sharing#slide=id.a '), { deckId: 'deck_123', url: 'https://docs.google.com/presentation/d/deck_123/present' })
  assert.deepEqual(presentationURL('https://docs.google.com/presentation/u/1/d/deck_123/edit'), { deckId: 'deck_123', url: 'https://docs.google.com/presentation/d/deck_123/present' })
  for (const url of ['javascript:alert(1)', 'http://docs.google.com/presentation/d/x/edit', 'https://docs.google.com.evil.test/presentation/d/x', 'https://user@docs.google.com/presentation/d/x', 'https://docs.google.com/presentation/d/e/published', 'not a link']) {
    assert.throws(() => presentationURL(url))
  }
})

test('extension-free Chrome controls only its background deck, rejects stale targets, and preserves its own profile', { timeout: 30000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'nextslide-chrome-test-'))
  let chrome: ChromePipe
  let slideSession = ''
  let activations = 0
  let pageBody = fixture
  const launch = async (path: string) => {
    chrome = await ChromePipe.launch(path, { headless: true })
    const send = chrome.send.bind(chrome)
    chrome.on('event', (event: ChromeEvent) => {
      if (event.method !== 'Fetch.requestPaused') return
      const body = event.params.request.url.includes('example.test') ? '<input id="work" value="Keep typing here">' : pageBody
      void send('Fetch.fulfillRequest', { requestId: event.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from(body).toString('base64') }, event.sessionId).catch(() => {})
    })
    chrome.send = async (method, params = {}, sessionId, timeout) => {
      if (method === 'Target.activateTarget') activations++
      const result = await send(method, params, sessionId, timeout)
      if (method === 'Target.attachToTarget') {
        slideSession = result.sessionId
        await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] }, result.sessionId)
      }
      return result
    }
    return chrome
  }
  const browser = new BrowserControl(profile, launch)
  try {
    const target = await browser.openDeck('https://docs.google.com/presentation/d/testDeck/edit')
    const deckSession = slideSession
    await until(async () => (await browser.status(target)).running)
    assert.equal((await browser.status(target)).requiresFocus, false)
    assert.equal((await browser.status(target)).frontmost, false)
    assert.equal(browser.list()[0].name, 'Test deck')
    const other = await chrome!.send('Target.createTarget', { url: 'about:blank', newWindow: true })
    const { sessionId: otherSession } = await chrome!.send('Target.attachToTarget', { targetId: other.targetId, flatten: true })
    await chrome!.send('Page.navigate', { url: 'https://example.test/work' }, otherSession)
    await until(async () => (await chrome!.send('Runtime.evaluate', { expression: '!!document.querySelector("#work")', returnByValue: true }, otherSession)).result.value)
    await chrome!.send('Target.activateTarget', { targetId: other.targetId })
    await chrome!.send('Runtime.evaluate', { expression: 'document.querySelector("#work").focus()' }, otherSession)
    const before = activations
    const command = { type: 'command' as const, id: 'single-click-command', direction: 'next' as const, expiresAt: Date.now() + 4000 }
    await browser.dispatch(target, command)
    await browser.dispatch(target, command)
    assert.equal(activations, before, 'remote clicks must not activate the presentation')
    const read = async (expression: string, session = deckSession) => (await chrome!.send('Runtime.evaluate', { expression, returnByValue: true }, session)).result.value
    assert.equal(await read('document.querySelector("#slide").textContent'), '2')
    assert.equal(await read('document.activeElement.id', otherSession), 'work')
    assert.equal(await read('document.querySelector("#work").value', otherSession), 'Keep typing here')
    await assert.rejects(browser.dispatch(target, { ...command, id: 'old', expiresAt: Date.now() - 1 }), /expired/)
    await read('localStorage.setItem("test-login", "remembered")')
    await chrome!.send('Page.navigate', { url: 'https://docs.google.com/presentation/d/differentDeck/present' }, deckSession)
    await until(async () => !(await browser.status(target)).running)
    await assert.rejects(browser.dispatch(target, { ...command, id: 'wrong-deck', expiresAt: Date.now() + 4000 }), /selected deck/)
    const newTarget = await browser.openDeck('https://docs.google.com/presentation/d/newDeck/edit')
    await until(async () => (await browser.status(newTarget)).running)
    await assert.rejects(browser.dispatch(target, { ...command, expiresAt: Date.now() + 4000 }), /closed/)
    await chrome!.send('Target.closeTarget', { targetId: newTarget.tabKey!.split(':')[1] })
    await until(async () => browser.list().length === 0)
    assert.equal((await browser.status(newTarget)).running, false)
    await browser.close()
    const reopened = await browser.openDeck('https://docs.google.com/presentation/d/testDeck/edit')
    await until(async () => (await browser.status(reopened)).running)
    assert.equal(await read('localStorage.getItem("test-login")', slideSession), 'remembered')
    // Google can show a sign-in iframe at the deck URL instead of redirecting.
    pageBody = '<a href="https://accounts.google.com/ServiceLogin">Sign in</a>'
    const authTarget = await browser.openDeck('https://docs.google.com/presentation/d/testDeck/present')
    await until(async () => (await browser.status(authTarget)).remoteMessage === 'The host needs to sign in to Google.')
    assert.equal((await browser.status(authTarget)).message, 'Sign in to Google in the presentation window.')
    await assert.rejects(browser.dispatch(authTarget, { ...command, id: 'sign-in-page', expiresAt: Date.now() + 3000 }), /Sign in/)
    pageBody = '<h1>You need access</h1><button>Request access</button>'
    await browser.openDeck('https://docs.google.com/presentation/d/testDeck/present')
    await until(async () => (await browser.status(authTarget)).remoteMessage === 'The host needs access to the presentation.')
    // A hidden viewer can precede the active viewer in Google's document.
    pageBody = '<div class="punch-viewer-content" style="display:none"></div>' + fixture
    await browser.openDeck('https://docs.google.com/presentation/d/testDeck/present')
    await until(async () => (await browser.status(authTarget)).running)
    await browser.dispatch(authTarget, { ...command, id: 'visible-viewer', expiresAt: Date.now() + 3000 })
    assert.equal(await read('document.querySelector("#slide").textContent', slideSession), '2')
  } finally { await browser.close(); await rm(profile, { recursive: true, force: true }) }
})
