import { PeerLink, SignalingClient, type Ack, type ControlState, type Direction, type Packet, type Signal, type WireMessage } from '@nextslide/connection'

export type RemoteSnapshot = { connected: boolean; ready: boolean; enabled: boolean; pending: boolean; message: string; error: string; latency: number | null }
const initial: RemoteSnapshot = { connected: false, ready: false, enabled: false, pending: false, message: 'Connecting…', error: '', latency: null }

export class DesktopRemote {
  private signaling: SignalingClient
  private link?: PeerLink
  private state = { ...initial }
  private lastState?: ControlState
  private lastStateAt = 0
  private pending?: { id: string; sent: number; timer: ReturnType<typeof setTimeout> }
  private watchdog: ReturnType<typeof setInterval>
  private stopped = false
  private cooldownUntil = 0
  private cooldownTimer?: ReturnType<typeof setTimeout>
  private resumeToken = ''

  constructor(origin: string, private id: string, token: string, name: string, private change: (state: RemoteSnapshot) => void) {
    try { this.resumeToken = sessionStorage.getItem(`nextslide-resume-${id}`) ?? '' } catch { /* Private browsing. */ }
    this.signaling = new SignalingClient(origin, id,
      () => ({ role: 'guest', token, name, resumeToken: this.resumeToken }),
      msg => this.message(msg),
      (connected, error) => {
        this.state.connected = connected
        if (!connected) {
          this.resetLink()
          this.state.message = error ?? 'Reconnecting…'
          this.state.error = error ?? ''
        }
        this.emit()
      },
    )
    this.watchdog = setInterval(() => {
      if (this.state.ready && performance.now() - this.lastStateAt > 3500) {
        this.state.ready = false
        this.state.message = 'Waiting for the host to reconnect.'
        this.emit()
      }
    }, 500)
  }

  private message(msg: WireMessage): void {
    if (this.stopped) return
    if (msg.type === 'welcome' && msg.resumeToken) {
      this.resumeToken = msg.resumeToken
      try { sessionStorage.setItem(`nextslide-resume-${this.id}`, this.resumeToken) } catch { /* In-memory reconnection still works. */ }
    } else if (msg.type === 'host_status') {
      this.resetLink()
      if (msg.online) {
        this.state.message = 'The host will give you control when it’s your turn.'
        this.link = new PeerLink(false,
          data => { this.signaling.send({ type: 'signal', data }) },
          data => this.signaling.send({ type: 'relay', data }),
          data => this.receive(data),
          () => {},
        )
      } else this.state.message = 'The host is disconnected. Waiting to reconnect.'
      this.emit()
    } else if (msg.type === 'signal' && msg.data) this.link?.accept(msg.data as Signal)
    else if (msg.type === 'relay' && msg.data) this.receive(msg.data)
  }

  private receive(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const data = value as Packet
    if (data.type === 'state' && typeof data.enabled === 'boolean' && typeof data.ready === 'boolean' && typeof data.hostTime === 'number' && Number.isFinite(data.hostTime) && typeof data.message === 'string') {
      this.lastState = data
      this.lastStateAt = performance.now()
      this.state.enabled = data.enabled
      this.state.ready = data.enabled && data.ready && this.state.connected
      this.state.message = data.message
      this.emit()
    } else if (data.type === 'ack') this.ack(data)
  }

  click(direction: Direction): void {
    if (!this.state.ready || this.pending || performance.now() < this.cooldownUntil || !this.lastState || performance.now() - this.lastStateAt > 3500) return
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
    const sent = performance.now()
    this.cooldownUntil = sent + 450
    clearTimeout(this.cooldownTimer)
    this.cooldownTimer = setTimeout(() => this.emit(), 450)
    // Use the host's clock estimate, not the phone's wall clock. No click is
    // retained for reconnection and no unacknowledged command is auto-replayed.
    const expiresAt = this.lastState.hostTime + (sent - this.lastStateAt) + 1500
    const timer = setTimeout(() => {
      if (this.pending?.id !== id) return
      this.pending = undefined
      this.state.pending = false
      this.state.error = 'Command not confirmed. Check the slide before trying again.'
      this.emit()
    }, 2500)
    this.pending = { id, sent, timer }
    this.state.pending = true
    this.state.error = ''
    if (!this.link?.send({ type: 'command', id, direction, expiresAt })) {
      clearTimeout(timer)
      this.pending = undefined
      this.state.pending = false
      this.state.error = 'Connection interrupted. Waiting to reconnect.'
    }
    this.emit()
  }

  private ack(ack: Ack): void {
    if (ack.id !== this.pending?.id || typeof ack.ok !== 'boolean') return
    clearTimeout(this.pending.timer)
    this.state.latency = Math.round(performance.now() - this.pending.sent)
    this.pending = undefined
    this.state.pending = false
    this.state.error = ack.ok ? '' : (typeof ack.error === 'string' ? ack.error : 'The host could not advance the slide.')
    this.emit()
  }

  private resetLink(): void {
    this.link?.close(); this.link = undefined
    this.lastState = undefined
    this.cooldownUntil = 0
    clearTimeout(this.cooldownTimer)
    this.state.ready = false
    this.state.enabled = false
    if (this.pending) {
      clearTimeout(this.pending.timer); this.pending = undefined
      this.state.pending = false
      this.state.error = 'Connection interrupted. Check the slide before trying again.'
    }
  }
  private emit(): void { if (!this.stopped) this.change({ ...this.state, pending: !!this.pending || performance.now() < this.cooldownUntil }) }
  close(): void { this.stopped = true; this.signaling.close(); this.resetLink(); clearInterval(this.watchdog) }
}
