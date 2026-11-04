import { test, expect, type Page } from '@playwright/test'

test('create an invite before the deck is ready; remote clicks stay paused until it is ready', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const deck = { pid: 321, name: 'Your Google Slides presentation', bundleId: 'com.google.Chrome', tabKey: 'presentation:one:deck', ready: false }
    const state = { opened: '', ready: false, shown: false, invite: '', commands: 0 }
    ;(window as any).__deck = state
    ;(window as any).nextslide = {
      config: async () => ({ service: 'http://127.0.0.1:4654' }),
      apps: async () => state.opened ? [{ ...deck, ready: state.ready }] : [],
      status: async () => ({ trusted: true, running: state.ready, frontmost: false, requiresFocus: false, message: 'Finish signing in or opening your deck in the presentation window. It will be detected automatically.' }),
      openDeck: async (url: string) => { state.opened = url; return deck },
      showPresentation: async () => { state.shown = true },
      startHosting: async () => ({ service: 'http://127.0.0.1:4654', inviteOrigin: 'http://127.0.0.1:4654' }),
      stopHosting: async () => {}, active: async () => {},
      copy: async (invite: string) => { state.invite = invite },
      dispatch: async () => { if (!state.ready) throw new Error('Presentation not ready'); state.commands++ },
    }
  })
  await page.setViewportSize({ width: 380, height: 650 })
  await page.goto('http://127.0.0.1:5657')
  await expect(page.getByRole('button', { name: 'Open presentation' })).toBeDisabled()
  await page.getByLabel('Google Slides link').fill('https://docs.google.com/presentation/d/deck/edit')
  await expect(page.getByRole('button', { name: 'Open presentation' })).toBeEnabled()
  await expect(page.getByText('Connect Chrome once')).toHaveCount(0)
  await expect(page.getByText('Set up Chrome')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/menubar-no-extension.png' })
  await page.getByRole('button', { name: 'Open presentation' }).click()
  await expect(page.getByRole('button', { name: 'Create speaker invite' })).toBeEnabled()
  await expect(page.getByText(/Finish signing in/)).toBeVisible()
  await page.getByRole('button', { name: 'Create speaker invite' }).click()
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible()
  await expect(page.getByText('Speakers can join now.')).toBeVisible()
  await page.getByRole('button', { name: 'Copy invite link' }).click()
  const invite = await page.evaluate(() => (window as any).__deck.invite as string)
  expect(invite).toMatch(/\/r\/.+#/)
  const remote = await browser.newPage()
  await remote.goto(invite)
  await remote.getByLabel('Your name').fill('Early speaker')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  const next = remote.getByRole('button', { name: /Next slide/ })
  await expect(next).toBeDisabled()
  await page.getByRole('button', { name: 'Show presentation window' }).click()
  expect(await page.evaluate(() => (window as any).__deck.shown)).toBe(true)
  await page.evaluate(() => { (window as any).__deck.ready = true })
  await expect(next).toBeEnabled()
  await next.click()
  await expect.poll(() => page.evaluate(() => (window as any).__deck.commands)).toBe(1)
  await page.evaluate(() => { (window as any).__deck.ready = false })
  await expect(page.getByText('Allowed · waiting for presentation')).toBeVisible()
  await expect(page.getByText('Speakers can join now.')).toBeVisible()
  await expect(next).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible()
  await page.screenshot({ path: 'test-results/menubar-invite-before-ready.png' })
  await page.getByRole('button', { name: 'End session' }).click()
  await remote.close()
})

test('granting Accessibility updates the existing host panel and revocation disables Start', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { trusted: false, selected: false }
    ;(window as any).__permission = state
    ;(window as any).nextslide = {
      config: async () => ({ service: 'http://127.0.0.1:4654' }),
      apps: async () => [{ pid: 123, name: 'Keynote', bundleId: 'com.apple.iWork.Keynote' }],
      selectApp: async () => { state.selected = true },
      status: async () => ({ trusted: state.trusted, running: state.selected, frontmost: true }),
      requestAccess: async () => {},
      startHosting: async () => ({ service: 'http://127.0.0.1:4654', inviteOrigin: 'http://127.0.0.1:4654' }), stopHosting: async () => {},
    }
  })
  await page.goto('http://127.0.0.1:5657')
  await page.getByRole('button', { name: 'Use Keynote or PowerPoint' }).click()
  await page.getByLabel('Presentation').selectOption('123')
  const start = page.getByRole('button', { name: 'Create speaker invite' })
  await expect(start).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Allow Accessibility access' })).toBeVisible()
  await page.evaluate(() => { (window as any).__permission.trusted = true; window.dispatchEvent(new Event('nextslide-refresh')) })
  await expect(start).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Allow Accessibility access' })).toHaveCount(0)
  await expect(page.getByLabel('Presentation')).toHaveValue('123')
  await page.evaluate(() => { (window as any).__permission.trusted = false })
  await expect(start).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Allow Accessibility access' })).toBeVisible()
})

async function hostUI(page: Page) {
  await page.addInitScript(() => {
    const state = { commands: [] as unknown[], invite: '', active: false, frontmost: true, background: false }
    ;(window as any).__test = state
    ;(window as any).__pcs = []
    ;(window as any).__channels = []
    const Original = window.RTCPeerConnection
    window.RTCPeerConnection = class extends Original {
      constructor(config?: RTCConfiguration) { super(config); (window as any).__pcs.push(this) }
      createDataChannel(label: string, options?: RTCDataChannelInit) { const channel = super.createDataChannel(label, options); (window as any).__channels.push(channel); return channel }
    }
    ;(window as any).nextslide = {
      config: async () => ({ service: 'http://127.0.0.1:4654' }), saveService: async () => {},
      apps: async () => [{ pid: 123, name: 'Keynote', bundleId: 'com.apple.iWork.Keynote' }],
      selectApp: async () => {}, status: async () => ({ trusted: true, running: true, frontmost: state.frontmost, requiresFocus: !state.background }),
      requestAccess: async () => {},
      startHosting: async () => ({ service: 'http://127.0.0.1:4654', inviteOrigin: 'http://127.0.0.1:4654' }), stopHosting: async () => {}, active: async (value: boolean) => { state.active = value },
      dispatch: async (command: unknown) => { if (!state.active || (!state.background && !state.frontmost)) throw new Error('Bring your presentation to the front.'); state.commands.push(command) },
      copy: async (value: string) => { state.invite = value }, hide: async () => {}, quit: async () => {},
    }
  })
  await page.setViewportSize({ width: 380, height: 650 })
  await page.goto('http://127.0.0.1:5657')
  await page.getByRole('button', { name: 'Use Keynote or PowerPoint' }).click()
  await page.getByLabel('Presentation').selectOption('123')
  await page.getByRole('button', { name: 'Create speaker invite' }).click()
  await expect(page.getByRole('heading', { name: 'Your session' })).toBeVisible()
  await page.getByRole('button', { name: 'Copy invite link' }).click()
  return page.evaluate(() => (window as any).__test.invite as string)
}

test('menu bar host approves a browser remote, sends direct clicks, pauses, reconnects, and ends the invite', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const invite = await hostUI(page)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const remote = await context.newPage()
  await remote.addInitScript(() => {
    ;(window as any).__relayedCommands = 0
    const send = WebSocket.prototype.send
    WebSocket.prototype.send = function(data) {
      if (typeof data === 'string') { const packet = JSON.parse(data); if (packet.type === 'relay' && packet.data?.type === 'command') (window as any).__relayedCommands++ }
      return send.call(this, data)
    }
  })
  remote.on('pageerror', error => errors.push(error.message))
  await remote.goto(invite)
  await remote.getByLabel('Your name').fill('Taylor')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  const next = remote.getByRole('button', { name: 'Next slide', exact: false })
  await expect(next).toBeDisabled()
  await expect(page.getByText('Taylor', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(next).toBeEnabled()
  await expect.poll(() => page.evaluate(() => (window as any).__channels.some((channel: RTCDataChannel) => channel.readyState === 'open')), { timeout: 10000 }).toBe(true)
  await next.click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await expect(remote.getByRole('button', { name: /Next slide/ })).toBeEnabled()
  expect(await remote.evaluate(() => (window as any).__relayedCommands)).toBe(0)
  await page.screenshot({ path: 'test-results/menubar-session.png' })
  await remote.screenshot({ path: 'test-results/speaker-remote.png', fullPage: true })

  const second = await context.newPage()
  await second.goto(invite)
  await second.getByLabel('Your name').fill('Morgan')
  await second.getByRole('button', { name: 'Join presentation' }).click()
  await page.locator('.guest').filter({ hasText: 'Morgan' }).getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(next).toBeDisabled()
  await expect(second.getByRole('button', { name: /Next slide/ })).toBeEnabled()
  // Even a speaker bypassing their disabled button cannot keep control.
  await page.locator('.guest').filter({ hasText: 'Taylor' }).getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(next).toBeEnabled()
  await expect(second.getByRole('button', { name: /Next slide/ })).toBeDisabled()
  await second.close()

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(next).toBeDisabled()
  await page.locator('.guest').filter({ hasText: 'Taylor' }).getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(next).toBeEnabled()
  await page.evaluate(() => { (window as any).__test.frontmost = false })
  await expect(next).toBeDisabled()
  await page.evaluate(() => { (window as any).__test.frontmost = true })
  await expect(next).toBeEnabled()
  await page.evaluate(() => { (window as any).__test.background = true; (window as any).__test.frontmost = false })
  await expect(next).toBeEnabled()

  // Refresh preserves the secret resume identity, so approval does not need to
  // be granted again. No prior click is replayed during this transition.
  await remote.reload()
  await remote.getByLabel('Your name').fill('Taylor')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  await expect(next).toBeEnabled()
  expect(await page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await remote.getByRole('button', { name: 'Previous slide' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(2)
  await page.getByRole('button', { name: 'End session' }).click()
  await expect(next).toBeDisabled()
  await expect(remote.getByRole('alert')).toContainText('ended')
  expect(errors).toEqual([])
  await context.close()
})

test('commands work through the authenticated fallback when direct connectivity fails', async ({ page, browser }) => {
  const invite = await hostUI(page)
  const remote = await browser.newPage()
  await remote.goto(invite)
  await remote.getByLabel('Your name').fill('Relay speaker')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(remote.getByRole('button', { name: /Next slide/ })).toBeEnabled()
  await page.evaluate(() => { for (const pc of (window as any).__pcs) pc.close() })
  await remote.getByRole('button', { name: /Next slide/ }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await expect(remote.getByRole('button', { name: /Next slide/ })).toBeEnabled()
  await page.getByRole('button', { name: 'End session' }).click()
  await remote.close()
})

test('a browser with WebRTC disabled can still join and send an approved click', async ({ page, browser }) => {
  const invite = await hostUI(page)
  const remote = await browser.newPage()
  await remote.addInitScript(() => { (window as any).RTCPeerConnection = class { constructor() { throw new Error('WebRTC is disabled') } } })
  await remote.goto(invite)
  await remote.getByLabel('Your name').fill('Restricted network')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(remote.getByRole('button', { name: /Next slide/ })).toBeEnabled()
  await remote.getByRole('button', { name: /Next slide/ }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await page.getByRole('button', { name: 'End session' }).click()
  await remote.close()
})

test('an acknowledged command keeps a short button cooldown to prevent rapid repeat clicks', async ({ page, browser }) => {
  const invite = await hostUI(page)
  const remote = await browser.newPage()
  await remote.goto(invite)
  await remote.getByLabel('Your name').fill('Speaker')
  await remote.getByRole('button', { name: 'Join presentation' }).click()
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  const next = remote.getByRole('button', { name: 'Next slide', exact: true })
  await expect(next).toBeEnabled()
  await next.click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await expect(next).toBeDisabled()
  await expect(next).toHaveAttribute('aria-busy', 'true')
  await remote.evaluate(() => { for (let i = 0; i < 8; i++) (document.querySelector('.remote-next') as HTMLButtonElement).click() })
  expect(await page.evaluate(() => (window as any).__test.commands.length)).toBe(1)
  await expect(next).toBeEnabled()
  await expect(remote.getByText('Command sent')).toHaveCount(0)
  await next.click()
  await expect.poll(() => page.evaluate(() => (window as any).__test.commands.length)).toBe(2)
  await page.getByRole('button', { name: 'End session' }).click()
  await remote.close()
})
