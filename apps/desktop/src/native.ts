import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { NativeStatus } from './types'

export class NativeControl {
  private child: ChildProcessWithoutNullStreams
  private sequence = 0
  private closed = false
  private queue = Promise.resolve()
  private lastPermissionCheck = 0
  private permissionCheck?: Promise<void>
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private path: string, private permissionInterval = 2000) {
    this.child = this.startChild()
  }
  private startChild(): ChildProcessWithoutNullStreams {
    const child = spawn(this.path, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    createInterface({ input: child.stdout }).on('line', line => {
      if (child !== this.child) return
      let result: { id: number; error?: string }
      try { result = JSON.parse(line) as typeof result } catch { return }
      const pending = this.pending.get(result.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(result.id)
      if (result.error) pending.reject(new Error(result.error))
      else pending.resolve(result)
    })
    const failed = () => { if (child === this.child) this.fail() }
    child.on('error', failed)
    child.stdin.on('error', failed)
    child.on('exit', failed)
    child.stderr.on('data', () => { /* Do not print session or system data. */ })
    return child
  }
  private fail(): void {
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('The presentation helper stopped. Restart Nextslide.')) }
    this.pending.clear()
  }
  private schedule<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work)
    this.queue = result.then(() => {}, () => {})
    return result
  }
  request<T>(action: string, args: object = {}): Promise<T> {
    return this.schedule(() => this.send<T>(action, args))
  }
  private send<T>(action: string, args: object): Promise<T> {
    if (this.closed || this.child.exitCode !== null || this.child.killed || this.child.stdin.destroyed) return Promise.reject(new Error('The presentation helper is unavailable. Restart Nextslide.'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The presentation app did not respond.')) }, 2000)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ ...args, id, action }) + '\n')
    })
  }
  async status(args: object = {}): Promise<NativeStatus> {
    const status = await this.request<NativeStatus>('status', args)
    if (!this.permissionCheck && Date.now() - this.lastPermissionCheck >= this.permissionInterval) {
      this.lastPermissionCheck = Date.now()
      this.permissionCheck = this.refreshPermission(status.trusted).finally(() => { this.permissionCheck = undefined })
    }
    // The fresh probe runs outside the command queue so it cannot add process
    // startup latency to an incoming slide command.
    if (this.permissionCheck) await this.permissionCheck
    return this.request<NativeStatus>('status', args)
  }
  private async refreshPermission(cached: boolean): Promise<void> {
    const trusted = await new Promise<boolean>((resolve, reject) => {
      execFile(this.path, ['--permission-status'], { timeout: 2000, maxBuffer: 1024 }, (error, stdout) => {
        if (error) { reject(new Error('Could not refresh Accessibility access. Please reopen Nextslide.')); return }
        const value = stdout.trim()
        if (value !== 'true' && value !== 'false') { reject(new Error('Could not read Accessibility access.')); return }
        resolve(value === 'true')
      })
    })
    if (trusted === cached || this.closed) return
    await this.schedule(async () => {
      if (this.closed) return
      // Replace only between requests; an old worker's exit cannot reject a
      // new worker's requests or interrupt a slide command in flight.
      const previous = this.child
      this.child = this.startChild()
      previous.kill()
    })
  }
  refreshAccess(): void { this.lastPermissionCheck = 0 }
  close(): void { this.closed = true; this.child.kill(); this.fail() }
}
