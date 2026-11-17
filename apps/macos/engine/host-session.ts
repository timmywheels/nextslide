import { CommandGate, PeerLink, SignalingClient, type Credentials, type Guest, type Packet, type Signal, type Command, type WireMessage } from '@nextslide/connection'
import type { NativeStatus } from './types'

export type HostGuest = Guest & { enabled: boolean; direct: boolean }
type Entry = { guest: HostGuest; gate: CommandGate; link?: PeerLink }
export type HostSnapshot = { guests: HostGuest[]; connected: boolean; invite: string; error: string }

export class HostSession {
  private credentials?: Credentials
  private signaling?: SignalingClient
  private entries = new Map<string, Entry>()
  private status?: NativeStatus
  private connected = false
  private stopped = false
  private error = ''
  private pulse?: ReturnType<typeof setInterval>
  private resolveJoin?: () => void
  private rejectJoin?: (error: Error) => void

  constructor(private origin: string, private dispatch: (command: Command) => Promise<void>, private change: (snapshot: HostSnapshot) => void, private ended: () => void, private inviteOrigin = origin, private createToken?: string) {}

  async start(): Promise<void> {
    const response = await fetch(`${this.origin}/api/desktop/sessions`, { method: 'POST', headers: this.createToken ? { 'X-Nextslide-Host': this.createToken } : {}, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(response.status === 404 ? 'This service needs the menu bar update. Check the service address in Settings.' : 'Could not start a session. Please try again.')
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('This service needs the menu bar update. Check the service address in Settings.')
    const credentials = await response.json() as Credentials
    if (!credentials.id || !credentials.hostToken || !credentials.inviteToken) throw new Error('The service does not support menu bar sessions yet.')
    this.credentials = credentials
    if (this.stopped) {
      await fetch(`${this.origin}/api/desktop/sessions/${credentials.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${credentials.hostToken}` }, signal: AbortSignal.timeout(3000) }).catch(() => {})
      throw new Error('This session was ended.')
    }
    const joined = new Promise<void>((resolve, reject) => { this.resolveJoin = resolve; this.rejectJoin = reject })
    const timeout = setTimeout(() => this.rejectJoin?.(new Error('Could not connect. Check your service address and network.')), 12000)
    this.signaling = new SignalingClient(this.origin, credentials.id,
      () => ({ role: 'host', token: credentials.hostToken }),
      msg => this.message(msg),
      (connected, error) => {
        if (this.stopped) return
        this.connected = connected
        if (!connected) for (const entry of this.entries.values()) { entry.link?.close(); entry.link = undefined; entry.guest.online = false; entry.guest.direct = false }
        if (error) { this.error = error; this.rejectJoin?.(new Error(error)); this.ended() }
        this.emit()
      },
    )
    try { await joined } finally { clearTimeout(timeout) }
    this.pulse = setInterval(() => this.publish(), 1000)
    this.emit()
  }

  private message(msg: WireMessage): void {
    if (this.stopped) return
    if (msg.type === 'welcome') {
      for (const guest of msg.peers ?? []) if (guest.online) this.join(guest)
      this.resolveJoin?.()
    } else if (msg.type === 'guest_joined' && msg.guest) this.join(msg.guest)
    else if (msg.type === 'guest_left' && msg.peerId) {
      const entry = this.entries.get(msg.peerId)
      if (entry) { entry.guest.online = false; entry.guest.direct = false; entry.link?.close(); entry.link = undefined }
      this.emit()
    } else if (msg.peerId && msg.data) {
      const entry = this.entries.get(msg.peerId)
      if (msg.type === 'signal') entry?.link?.accept(msg.data as Signal)
      else if (msg.type === 'relay' && entry) this.receive(entry, msg.data)
    }
  }

  private join(guest: Guest): void {
    const previous = this.entries.get(guest.id)
    previous?.link?.close()
    const entry: Entry = previous ?? { guest: { ...guest, enabled: false, direct: false }, gate: new CommandGate() }
    entry.guest = { ...guest, enabled: entry.guest.enabled, direct: false }
    this.entries.set(guest.id, entry)
    entry.link = new PeerLink(true,
      data => { this.signaling?.send({ type: 'signal', peerId: guest.id, data }) },
      data => this.signaling?.send({ type: 'relay', peerId: guest.id, data }) ?? false,
      data => this.receive(entry, data),
      direct => { entry.guest.direct = direct; this.publish(); this.emit() },
    )
    this.publish()
    this.emit()
  }

  private receive(entry: Entry, data: unknown): void {
    if (this.stopped || !entry.guest.online) return
    const result = entry.gate.execute(data, entry.guest.enabled, async command => {
      if (this.stopped || !entry.guest.enabled || !entry.guest.online) throw new Error('Your controls are paused.')
      await this.dispatch(command)
    })
    if (result) void result.then(ack => entry.link?.send(ack))
  }

  updateStatus(status: NativeStatus): void { this.status = status; this.publish() }
  enable(id: string, enabled: boolean): void {
    const entry = this.entries.get(id)
    if (entry) {
      if (enabled) for (const other of this.entries.values()) other.guest.enabled = false
      entry.guest.enabled = enabled
      this.publish(); this.emit()
    }
  }
  pauseAll(): void {
    for (const entry of this.entries.values()) entry.guest.enabled = false
    this.publish(); this.emit()
  }

  private publish(): void {
    const ready = !!(this.status?.trusted && this.status.running && (this.status.requiresFocus === false || this.status.frontmost) && !this.stopped)
    for (const entry of this.entries.values()) {
      const message = !entry.guest.enabled ? 'The host will give you control when it’s your turn.'
        : !this.status?.trusted ? 'The host needs to allow Accessibility access.'
          : !this.status?.running ? this.status?.remoteMessage ?? 'Waiting for the presentation.'
            : !ready ? 'Waiting for the host to bring the presentation to the front.' : 'You can now control the presentation.'
      const packet: Packet = { type: 'state', enabled: entry.guest.enabled, ready, message, hostTime: Date.now() }
      entry.link?.send(packet)
    }
  }

  private emit(): void {
    this.change({ guests: [...this.entries.values()].map(e => ({ ...e.guest })), connected: this.connected,
      invite: this.credentials ? `${this.inviteOrigin}/r/${this.credentials.id}#${this.credentials.inviteToken}` : '', error: this.error })
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.rejectJoin?.(new Error('This session was ended.'))
    clearInterval(this.pulse)
    this.signaling?.send({ type: 'end' })
    this.signaling?.close()
    for (const entry of this.entries.values()) entry.link?.close()
    if (this.credentials) {
      await fetch(`${this.origin}/api/desktop/sessions/${this.credentials.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${this.credentials.hostToken}` }, signal: AbortSignal.timeout(3000),
      }).catch(() => {})
    }
  }
}
