import { ChromePipe, type ChromeEvent } from './chrome-pipe'
import { presentationFrame } from './presentation-control'
import type { Command } from '@nextslide/connection'
import type { NativeStatus, PresentationApp } from './types'

type Target = { id: string; session: string; deckId: string; app: PresentationApp }
type Frame = { frame: { id: string; url: string }; childFrames?: Frame[] }
type Inspection = { ready: true; context: string; name: string } | { ready: false; message: string; remoteMessage: string }
const deckIdFrom = (url: string) => url.match(/^https:\/\/docs\.google\.com\/presentation\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1]
const signIn: Inspection = { ready: false, message: 'Sign in to Google in the presentation window.', remoteMessage: 'The host needs to sign in to Google.' }

export function presentationURL(value: string): { url: string; deckId: string } {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Paste a Google Slides link.') }
  const deckId = url.pathname.match(/^\/presentation\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1]
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password || !deckId || deckId === 'e' || value.length > 4096) throw new Error('Paste the original Google Slides deck link, starting with https://docs.google.com/presentation/d/.')
  return { url: `https://docs.google.com/presentation/d/${deckId}/present`, deckId }
}

export class BrowserControl {
  private chrome?: ChromePipe
  private target?: Target
  private contexts = new Map<number, string>()
  private opening = false
  constructor(private profile: string, private launch = ChromePipe.launch) {}

  list(): PresentationApp[] { return this.target ? [{ ...this.target.app }] : [] }

  async openDeck(value: string): Promise<PresentationApp> {
    const deck = presentationURL(value)
    if (this.opening) throw new Error('Your presentation is still opening.')
    this.opening = true
    try {
      if (!this.chrome) {
        const chrome = await this.launch(this.profile)
        this.chrome = chrome
        chrome.on('closed', () => { if (this.chrome === chrome) { this.chrome = undefined; this.target = undefined; this.contexts.clear() } })
        chrome.on('event', (event: ChromeEvent) => {
          if (event.method === 'Target.targetDestroyed' && event.params.targetId === this.target?.id) this.target = undefined
          if (event.sessionId !== this.target?.session) return
          if (event.method === 'Runtime.executionContextCreated') this.contexts.set(event.params.context.id, event.params.context.uniqueId)
          if (event.method === 'Runtime.executionContextDestroyed') this.contexts.delete(event.params.executionContextId)
          if (event.method === 'Runtime.executionContextsCleared') this.contexts.clear()
        })
        await chrome.send('Target.setDiscoverTargets', { discover: true })
      }
      const chrome = this.chrome
      if (this.target) {
        try { await chrome.send('Target.getTargetInfo', { targetId: this.target.id }) }
        catch { this.target = undefined }
      }
      if (!this.target) {
        const { targetInfos } = await chrome.send('Target.getTargets')
        // This pipe can only see Nextslide's own profile. Reuse its launch window.
        const blank = targetInfos.find((info: any) => info.type === 'page' && info.url === 'about:blank')
        const id = blank?.targetId ?? (await chrome.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 1280, height: 800 })).targetId
        const { sessionId } = await chrome.send('Target.attachToTarget', { targetId: id, flatten: true })
        this.contexts.clear()
        this.target = { id, session: sessionId, deckId: deck.deckId, app: { pid: chrome.pid, bundleId: 'com.google.Chrome', name: 'Your Google Slides presentation', tabKey: `presentation:${id}:${deck.deckId}`, ready: false } }
        await chrome.send('Runtime.enable', {}, sessionId)
        await chrome.send('Page.enable', {}, sessionId)
      }
      const target = this.target
      target.deckId = deck.deckId
      target.app = { ...target.app, name: 'Your Google Slides presentation', tabKey: `presentation:${target.id}:${deck.deckId}`, ready: false }
      const navigation = await chrome.send('Page.navigate', { url: deck.url }, target.session, 15000)
      if (navigation.errorText) throw new Error('Could not load this presentation. Check your connection and open the deck again.')
      await this.show(target.app)
      return { ...target.app }
    } finally { this.opening = false }
  }

  async show(app: PresentationApp): Promise<void> {
    const target = this.current(app)
    // Focus changes only by an explicit host action, never a remote click.
    await this.chrome!.send('Target.activateTarget', { targetId: target.id })
  }

  private current(app: PresentationApp): Target {
    if (!this.chrome || !this.target || app.tabKey !== this.target.app.tabKey) throw new Error('The presentation window is closed. Open your deck again.')
    return this.target
  }

  private async presentationContext(target: Target): Promise<Inspection> {
    const chrome = this.chrome!
    const { frameTree } = await chrome.send<{ frameTree: Frame }>('Page.getFrameTree', {}, target.session)
    if (frameTree.frame.url.startsWith('https://accounts.google.com/')) return signIn
    if (frameTree.frame.url.startsWith('chrome-error:')) return { ready: false, message: 'Chrome could not load the presentation. Check the connection and reload the window.', remoteMessage: 'The host’s presentation could not load.' }
    if (deckIdFrom(frameTree.frame.url) !== target.deckId) return { ready: false, message: 'The presentation window is not showing the selected deck. Reopen the deck in Nextslide.', remoteMessage: 'The host needs to reopen the selected presentation.' }
    let unavailable: Inspection = { ready: false, message: 'The slideshow is not ready. Open the presentation window to check it.', remoteMessage: 'The host’s slideshow is not ready.' }
    const frames: Frame[] = []
    const visit = (tree: Frame) => { if (frames.length >= 30) return; frames.push(tree); tree.childFrames?.forEach(visit) }
    visit(frameTree)
    for (const frame of frames) {
      if (deckIdFrom(frame.frame.url) !== target.deckId || !/\/(present|preview|embed)(?:[/?#]|$)/.test(frame.frame.url)) continue
      const { executionContextId } = await chrome.send('Page.createIsolatedWorld', { frameId: frame.frame.id, worldName: 'Nextslide presentation' }, target.session)
      const context = this.contexts.get(executionContextId)
      if (!context) continue
      const { result, exceptionDetails } = await chrome.send('Runtime.evaluate', {
        expression: `(${presentationFrame.toString()})(${JSON.stringify({ deckId: target.deckId })})`, uniqueContextId: context, returnByValue: true,
      }, target.session)
      if (exceptionDetails) throw new Error('Could not inspect the presentation document.')
      if (result.value?.presenting) return { ready: true, context, name: result.value.title || 'Google Slides' }
      if (result.value?.issue === 'sign-in') unavailable = signIn
      else if (result.value?.issue === 'access') unavailable = { ready: false, message: 'This Google account does not have access to the deck. Check the presentation window.', remoteMessage: 'The host needs access to the presentation.' }
      else if (result.value?.issue === 'loading') unavailable = { ready: false, message: 'The presentation is loading.', remoteMessage: 'The presentation is loading.' }
    }
    return unavailable
  }

  async status(app: PresentationApp): Promise<NativeStatus> {
    const state: NativeStatus = { trusted: true, running: false, frontmost: false, requiresFocus: false }
    try {
      const target = this.current(app)
      const frame = await this.presentationContext(target)
      target.app.ready = frame.ready
      if (frame.ready) { target.app.name = frame.name; state.running = true }
      else { state.message = frame.message; state.remoteMessage = frame.remoteMessage }
    } catch {
      if (!this.target || !this.chrome) { state.message = 'The presentation window is closed. Reopen your deck.'; state.remoteMessage = 'The host’s presentation window is closed.' }
      else { state.message = 'Nextslide could not read the presentation window. Reopen the deck to reconnect.'; state.remoteMessage = 'The host needs to reconnect the presentation window.' }
    }
    return state
  }

  async dispatch(app: PresentationApp, command: Command): Promise<void> {
    const target = this.current(app)
    if (command.expiresAt < Date.now()) throw new Error('That click expired. Check the slide before trying again.')
    const frame = await this.presentationContext(target)
    if (!frame.ready) throw new Error(frame.message)
    // A unique execution context pins the document across navigation races.
    // The in-page guard checks the deck and expiry again immediately before input.
    const { result, exceptionDetails } = await this.chrome!.send('Runtime.evaluate', {
      expression: `(${presentationFrame.toString()})(${JSON.stringify({ deckId: target.deckId, command })})`,
      uniqueContextId: frame.context, returnByValue: true,
    }, target.session, 1800)
    if (exceptionDetails || !result.value?.ok) throw new Error(result.value?.error ?? 'The slideshow did not confirm the click. Check the slide before trying again.')
  }

  async close(): Promise<void> { await this.chrome?.close(); this.chrome = undefined; this.target = undefined; this.contexts.clear() }
}
