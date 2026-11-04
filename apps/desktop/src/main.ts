import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell, powerSaveBlocker, powerMonitor, screen } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { serviceURL, isCommand } from '@nextslide/connection'
import { NativeControl } from './native'
import { BrowserControl } from './browser-control'
import { PublicHost } from './public-host'
import type { PresentationApp } from './types'

app.setName('Nextslide')
let panel: BrowserWindow
let tray: Tray
let helper: NativeControl
let browser: BrowserControl
let publicHost: PublicHost
let target: PresentationApp | null = null
let active = false
let blocker: number | undefined
let quitting = false
let cleaning = false
let cleaned = false
let service = process.env.NEXTSLIDE_SERVICE_URL ?? ''
const configPath = () => join(app.getPath('userData'), 'settings.json')

function setActive(value: boolean): void {
  active = value
  if (value && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension')
  if (!value && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined }
  tray?.setToolTip(value ? 'Nextslide — session active' : 'Nextslide')
  tray?.setTitle(value ? ' •' : '')
}

function show(): void {
  const bounds = tray.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const [width, height] = panel.getSize()
  panel.setPosition(Math.max(area.x, Math.min(Math.round(bounds.x + bounds.width / 2 - width / 2), area.x + area.width - width)), Math.min(bounds.y + bounds.height + 6, area.y + area.height - height))
  panel.show()
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (tray) show() })
  void app.whenReady().then(async () => {
    if (process.platform !== 'darwin') { app.quit(); return }
    app.dock?.hide()
    try {
      const saved = JSON.parse(await readFile(configPath(), 'utf8')) as { service?: string }
      service = process.env.NEXTSLIDE_SERVICE_URL ?? saved.service ?? service
      if (service) service = serviceURL(service)
    } catch { if (service) service = serviceURL(service) }
    helper = new NativeControl(join(__dirname, 'slide-control'))
    await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 })
    browser = new BrowserControl(join(app.getPath('userData'), 'Presentation Browser'))
    // Retire the previous local companion's registration during upgrade.
    await rm(join(app.getPath('home'), 'Library/Application Support/Google/Chrome/NativeMessagingHosts/app.nextslide.desktop.json'), { force: true })
    await rm(join(app.getPath('userData'), 'browser.sock'), { force: true })
    publicHost = new PublicHost(__dirname, message => panel?.webContents.send('hosting-error', message))
    panel = new BrowserWindow({
      width: 380, height: 650, show: false, frame: false, resizable: false, skipTaskbar: true,
      fullscreenable: false, alwaysOnTop: true, backgroundColor: '#f7f8f5',
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    panel.webContents.on('will-navigate', event => event.preventDefault())
    panel.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    panel.webContents.on('render-process-gone', () => { setActive(false); panel.reload() })
    panel.on('blur', () => panel.hide())
    panel.on('show', () => { helper.refreshAccess(); panel.webContents.send('refresh-status') })
    panel.on('focus', () => { helper.refreshAccess(); panel.webContents.send('refresh-status') })
    panel.on('close', event => { if (!quitting) { event.preventDefault(); panel.hide() } })
    const icon = nativeImage.createFromPath(join(__dirname, 'tray.png'))
    icon.setTemplateImage(true)
    tray = new Tray(icon.resize({ width: 18, height: 18 }))
    tray.setToolTip('Nextslide')
    tray.on('click', () => panel.isVisible() ? panel.hide() : show())
    tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open Nextslide', click: show }, { type: 'separator' }, { label: 'Quit Nextslide', click: () => app.quit() },
    ])))
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Nextslide', submenu: [{ role: 'quit' }] }, { role: 'editMenu' }]))

    // Only the bundled, sandboxed UI can invoke the narrow native bridge.
    const handle = (name: string, handler: (...args: any[]) => unknown) => ipcMain.handle(name, (event, ...args) => {
      if (event.sender !== panel.webContents || event.senderFrame !== panel.webContents.mainFrame) throw new Error('Not authorized')
      return handler(...args)
    })
    handle('config', () => ({ service }))
    handle('save-service', async (value: string) => {
      if (active) throw new Error('End your session before changing the service.')
      service = value.trim() ? serviceURL(value) : ''
      await writeFile(configPath(), JSON.stringify({ service }), { mode: 0o600 })
    })
    const availableApps = async () => [...browser.list(), ...(await helper.request<{ apps: PresentationApp[] }>('list')).apps.filter(a => ['com.apple.iWork.Keynote', 'com.microsoft.Powerpoint'].includes(a.bundleId))]
    handle('apps', availableApps)
    handle('select-app', async (selected: PresentationApp | null) => {
      if (active) throw new Error('End the session before choosing another app.')
      const apps = await availableApps()
      target = selected ? apps.find(a => a.pid === selected.pid && a.bundleId === selected.bundleId && a.tabKey === selected.tabKey) ?? null : null
    })
    handle('status', () => target?.tabKey ? browser.status(target) : helper.status(target ?? {}))
    handle('show-presentation', () => { if (target?.tabKey) return browser.show(target) })
    handle('open-deck', async (url: string) => {
      if (active) throw new Error('End your session before changing decks.')
      target = await browser.openDeck(url)
      return target
    })
    handle('start-hosting', () => service ? { service, inviteOrigin: service } : publicHost.start())
    handle('stop-hosting', () => publicHost.stop())
    handle('request-access', async () => {
      await helper.request('request-access')
      helper.refreshAccess()
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    })
    handle('reveal-app', () => shell.showItemInFolder(app.isPackaged ? join(process.resourcesPath, '..', '..') : process.execPath))
    handle('active', (value: boolean) => setActive(value === true))
    handle('dispatch', async (value: unknown) => {
      if (!active || !target || !isCommand(value)) throw new Error('This session is no longer active.')
      if (value.expiresAt < Date.now() || value.expiresAt > Date.now() + 5000) throw new Error('That click expired.')
      if (target.tabKey) await browser.dispatch(target, value)
      else await helper.request('send', { ...target, direction: value.direction, expiresAt: value.expiresAt })
    })
    handle('copy', (value: string) => { if (typeof value === 'string' && value.length < 2048) clipboard.writeText(value) })
    handle('hide', () => panel.hide())
    handle('quit', () => app.quit())
    powerMonitor.on('lock-screen', () => { setActive(false); panel.webContents.send('locked') })
    powerMonitor.on('suspend', () => { setActive(false); panel.webContents.send('locked') })
    await panel.loadFile(join(__dirname, 'renderer/index.html'))
    show()
  })
}
app.on('window-all-closed', () => {})
process.on('SIGTERM', () => app.quit())
process.on('SIGINT', () => app.quit())
process.on('exit', () => { void publicHost?.stop() })
app.on('before-quit', event => {
  setActive(false)
  if (!quitting && panel && !panel.isDestroyed()) {
    quitting = true
    event.preventDefault()
    panel.webContents.send('shutdown')
    setTimeout(() => app.quit(), 3000).unref()
  } else if (!cleaned) {
    event.preventDefault()
    if (cleaning) return
    cleaning = true
    helper?.close()
    void Promise.allSettled([browser?.close(), publicHost?.stop()]).finally(() => { cleaned = true; app.quit() })
  }
})
