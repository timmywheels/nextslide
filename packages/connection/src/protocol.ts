export type Direction = 'next' | 'prev'
export type Guest = { id: string; name: string; online: boolean }
export type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
export type ControlState = { type: 'state'; enabled: boolean; ready: boolean; message: string; hostTime: number }
export type Command = { type: 'command'; id: string; direction: Direction; expiresAt: number }
export type Ack = { type: 'ack'; id: string; ok: boolean; error?: string }
export type Packet = ControlState | Command | Ack
export type WireMessage = {
  type: string; peerId?: string; resumeToken?: string; peers?: Guest[]; guest?: Guest;
  online?: boolean; error?: string; data?: Signal | Packet
}
export type Credentials = { id: string; hostToken: string; inviteToken: string }

export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'command' && typeof v.id === 'string' && /^[\w-]{16,80}$/.test(v.id)
    && (v.direction === 'next' || v.direction === 'prev')
    && typeof v.expiresAt === 'number' && Number.isFinite(v.expiresAt)
}

// Deduplication covers both transports and in-flight native dispatch, so a
// retransmitted packet cannot advance the slide a second time.
export class CommandGate {
  private results = new Map<string, Promise<Ack>>()
  private lastCommand = 0

  execute(value: unknown, allowed: boolean, dispatch: (command: Command) => Promise<void>, now = Date.now()): Promise<Ack> | null {
    if (!isCommand(value)) return null
    const existing = this.results.get(value.id)
    if (existing) return existing
    let error: string | undefined
    if (!allowed) error = 'The host has paused your controls.'
    else if (value.expiresAt < now || value.expiresAt > now + 5000) error = 'That click expired. Check the slide before trying again.'
    else if (now - this.lastCommand < 100) error = 'Please wait a moment before the next click.'
    if (!error) this.lastCommand = now
    const result: Promise<Ack> = error
      ? Promise.resolve({ type: 'ack', id: value.id, ok: false, error })
      : Promise.resolve().then(() => dispatch(value)).then(
        () => ({ type: 'ack' as const, id: value.id, ok: true }),
        (err: unknown) => ({ type: 'ack' as const, id: value.id, ok: false, error: err instanceof Error ? err.message : 'The host could not send the click.' }),
      )
    this.results.set(value.id, result)
    // Commands expire within seconds; a bounded history avoids unbounded sessions.
    if (this.results.size > 256) this.results.delete(this.results.keys().next().value!)
    return result
  }
}

export function serviceURL(value: string): string {
  const url = new URL(value)
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('Use an HTTPS service address, or HTTP on your local network.')
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Enter just the service origin, without a path.')
  return url.origin
}
