import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'

export type ChromeEvent = { method: string; params: any; sessionId?: string }

// Chrome's control channel lives on inherited pipes, never a TCP port.
// Only the dedicated profile launched by this process is reachable here.
export class ChromePipe extends EventEmitter {
  private sequence = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private closed = false
  private input: Writable
  readonly pid: number

  private constructor(private child: ChildProcess) {
    super()
    this.pid = child.pid ?? 0
    const onExit = () => { child.kill('SIGTERM') }
    process.once('exit', onExit)
    child.once('exit', () => process.removeListener('exit', onExit))
    child.once('error', () => process.removeListener('exit', onExit))
    this.input = child.stdio[3] as Writable
    const output = child.stdio[4] as Readable
    let buffer = ''
    output.setEncoding('utf8')
    output.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 8 * 1024 * 1024) { this.disconnect(); return }
      let end: number
      while ((end = buffer.indexOf('\0')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const packet = JSON.parse(line)
          if (packet.id) {
            const request = this.pending.get(packet.id)
            if (!request) continue
            this.pending.delete(packet.id); clearTimeout(request.timer)
            if (packet.error) request.reject(new Error(packet.error.message ?? 'Presentation browser error.'))
            else request.resolve(packet.result)
          } else this.emit('event', packet as ChromeEvent)
        } catch { this.disconnect(); return }
      }
    })
    this.input.on('error', () => this.disconnect())
    output.on('error', () => this.disconnect())
    output.on('end', () => this.disconnect())
    child.on('error', () => this.disconnect())
    child.on('exit', () => this.disconnect())
  }

  static async launch(profile: string, options: { executablePath?: string; headless?: boolean } = {}): Promise<ChromePipe> {
    let executable = options.executablePath
    if (!executable) {
      for (const path of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]) {
        try { await access(path); executable = path; break } catch { /* Try the next installation. */ }
      }
    }
    if (!executable) throw new Error('Install Google Chrome, then open your presentation again. No extension is needed.')
    await mkdir(profile, { recursive: true, mode: 0o700 })
    const args = [
      `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      ...(options.headless ? ['--headless=new', '--no-startup-window'] : ['--app=about:blank', '--window-size=1280,800']),
    ]
    const chrome = new ChromePipe(spawn(executable, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }))
    try { await chrome.send('Browser.getVersion', {}, undefined, 15000); return chrome }
    catch { await chrome.close(); throw new Error('Could not open the presentation browser. Close its old presentation windows and try again.') }
  }

  send<T = any>(method: string, params: object = {}, sessionId?: string, timeout = 3000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The presentation window is closed. Open your deck again.'))
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The presentation did not respond. Check the slide before trying again.')) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.input.write(JSON.stringify({ id, method, params, sessionId }) + '\0', error => { if (error) this.disconnect() })
    })
  }

  private disconnect(): void {
    if (this.closed) return
    this.closed = true
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('The presentation window disconnected. Open your deck again.')) }
    this.pending.clear()
    this.emit('closed')
  }

  async close(): Promise<void> {
    if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null) { this.disconnect(); return }
    const exited = new Promise<void>(resolve => this.child.once('exit', () => resolve()))
    const force = setTimeout(() => this.child.kill('SIGKILL'), 4000)
    try {
      await this.send('Browser.close', {}, undefined, 1000).catch(() => this.child.kill('SIGTERM'))
      await exited
    } finally { clearTimeout(force); this.disconnect() }
  }
}
