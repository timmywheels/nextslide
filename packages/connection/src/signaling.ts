import type { WireMessage } from './protocol.js'

export class SignalingClient {
  private socket?: WebSocket
  private timer?: ReturnType<typeof setTimeout>
  private joinTimer?: ReturnType<typeof setTimeout>
  private closed = false
  private joined = false
  private backoff = 500

  constructor(
    private origin: string,
    private id: string,
    private hello: () => Record<string, unknown>,
    private message: (message: WireMessage) => void,
    private status: (connected: boolean, error?: string) => void,
  ) { this.connect() }

  private connect(): void {
    if (this.closed) return
    const ws = new WebSocket(`${this.origin.replace(/^http/, 'ws')}/ws/desktop/${this.id}`)
    this.socket = ws
    this.joinTimer = setTimeout(() => ws.close(), 10000)
    ws.onopen = () => { if (!this.closed && this.socket === ws) ws.send(JSON.stringify({ type: 'hello', ...this.hello() })) }
    ws.onmessage = event => {
      if (this.closed || this.socket !== ws) return
      let msg: WireMessage
      try { msg = JSON.parse(event.data as string) as WireMessage } catch { return }
      if (msg.type === 'welcome') {
        clearTimeout(this.joinTimer)
        this.joined = true
        this.backoff = 500
        this.status(true)
      } else if (msg.type === 'ended' || msg.type === 'error') {
        this.close()
        this.status(false, msg.error ?? 'This session has ended. Ask the host for a new link.')
      }
      this.message(msg)
    }
    ws.onclose = () => {
      if (this.closed || this.socket !== ws) return
      clearTimeout(this.joinTimer)
      this.joined = false
      this.status(false)
      this.timer = setTimeout(() => this.connect(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, 5000)
    }
    ws.onerror = () => ws.close()
  }

  send(message: object): boolean {
    if (!this.joined || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 32768) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  close(): void {
    this.closed = true
    this.joined = false
    clearTimeout(this.timer)
    clearTimeout(this.joinTimer)
    this.socket?.close()
  }
}
