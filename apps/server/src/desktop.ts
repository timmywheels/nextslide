import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'

type GuestConnection = { id: string; name: string; resumeToken: string; socket: WebSocket | null }
type DesktopSession = {
  id: string; hostToken: string; inviteToken: string; expiresAt: number;
  host: WebSocket | null; guests: Map<string, GuestConnection>
}
const token = (): string => randomBytes(24).toString('base64url')
const equal = (value: unknown, secret: string): boolean => typeof value === 'string'
  && Buffer.byteLength(value) === Buffer.byteLength(secret)
  && timingSafeEqual(Buffer.from(value), Buffer.from(secret))
const send = (socket: WebSocket | null, data: object): void => {
  if (socket?.readyState === 1 && socket.bufferedAmount < 65536) socket.send(JSON.stringify(data))
}
const roster = (session: DesktopSession) => [...session.guests.values()].map(g => ({ id: g.id, name: g.name, online: g.socket?.readyState === 1 }))

// Separate, authenticated sessions for the menu bar app. Existing extension
// sessions retain their original protocol and endpoints.
const desktopRoutes: FastifyPluginAsync = async fastify => {
  const sessions = new Map<string, DesktopSession>()
  const attempts = new Map<string, { count: number; until: number }>()
  const sockets = new Set<WebSocket>()
  const alive = new Set<WebSocket>()

  const end = (session: DesktopSession): void => {
    sessions.delete(session.id)
    for (const socket of [session.host, ...[...session.guests.values()].map(g => g.socket)]) {
      send(socket, { type: 'ended' })
      socket?.close(1000, 'Session ended')
    }
  }

  fastify.post('/api/desktop/sessions', async (request, reply) => {
    const now = Date.now()
    const attempt = attempts.get(request.ip)
    if (attempt && attempt.until > now && attempt.count >= 20) return reply.code(429).send({ error: 'Please wait before starting another session.' })
    attempts.set(request.ip, attempt && attempt.until > now ? { ...attempt, count: attempt.count + 1 } : { count: 1, until: now + 60000 })
    if (sessions.size >= 1000) return reply.code(503).send({ error: 'The service is full. Please try again.' })
    const session: DesktopSession = {
      id: token(), hostToken: token(), inviteToken: token(), expiresAt: now + 4 * 60 * 60 * 1000,
      host: null, guests: new Map(),
    }
    sessions.set(session.id, session)
    reply.header('Cache-Control', 'no-store')
    return { id: session.id, hostToken: session.hostToken, inviteToken: session.inviteToken }
  })

  fastify.delete<{ Params: { id: string } }>('/api/desktop/sessions/:id', async (request, reply) => {
    const session = sessions.get(request.params.id)
    if (!session) return reply.code(204).send()
    if (!equal(request.headers.authorization?.replace(/^Bearer /, ''), session.hostToken)) return reply.code(403).send({ error: 'Not authorized' })
    end(session)
    return reply.code(204).send()
  })

  fastify.get<{ Params: { id: string } }>('/ws/desktop/:id', { websocket: true }, (socket, request) => {
    const session = sessions.get(request.params.id)
    if (!session || session.expiresAt <= Date.now()) {
      send(socket, { type: 'ended' }); socket.close(); return
    }
    sockets.add(socket)
    alive.add(socket)
    let role: 'host' | 'guest' | null = null
    let guest: GuestConnection | undefined
    let rate = { count: 0, until: Date.now() + 1000 }
    const reject = (error: string): void => { send(socket, { type: 'error', error }); socket.close(1008) }
    const joinTimeout = setTimeout(() => reject('Connection timed out.'), 10000)
    socket.on('pong', () => alive.add(socket))
    socket.on('error', () => socket.terminate())
    socket.on('message', (raw: Buffer) => {
      if (raw.length > 16384) { socket.close(1009); return }
      if (rate.until <= Date.now()) rate = { count: 0, until: Date.now() + 1000 }
      if (++rate.count > 100) { reject('Too many messages.'); return }
      let msg: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(raw.toString())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
        msg = parsed as Record<string, unknown>
      } catch { return }
      if (!role) {
        if (msg.type !== 'hello') { reject('Join the session first.'); return }
        if (msg.role === 'host' && equal(msg.token, session.hostToken)) {
          if (session.host && session.host !== socket) session.host.close(1000, 'Host reconnected')
          session.host = socket
          role = 'host'
          send(socket, { type: 'welcome', peerId: 'host', peers: roster(session) })
          for (const g of session.guests.values()) send(g.socket, { type: 'host_status', online: true })
        } else if (msg.role === 'guest' && equal(msg.token, session.inviteToken)) {
          const name = typeof msg.name === 'string' ? msg.name.trim().slice(0, 48) : ''
          if (!name) { reject('Enter your name to join.'); return }
          guest = [...session.guests.values()].find(g => equal(msg.resumeToken, g.resumeToken))
          if (!guest) {
            if (session.guests.size >= 32) { reject('This session has reached its speaker limit.'); return }
            guest = { id: token(), name, resumeToken: token(), socket: null }
            session.guests.set(guest.id, guest)
          }
          guest.socket?.close(1000, 'Speaker reconnected')
          guest.socket = socket
          guest.name = name
          role = 'guest'
          send(socket, { type: 'welcome', peerId: guest.id, resumeToken: guest.resumeToken })
          send(socket, { type: 'host_status', online: session.host?.readyState === 1 })
          send(session.host, { type: 'guest_joined', guest: { id: guest.id, name, online: true } })
        } else { reject('This invitation is invalid. Ask the host for a new link.'); return }
        clearTimeout(joinTimeout)
        return
      }
      // A replaced socket must not keep publishing as the same identity.
      if ((role === 'host' && session.host !== socket) || (role === 'guest' && guest?.socket !== socket)) return
      if (role === 'host' && msg.type === 'end') { end(session); return }
      if ((msg.type !== 'signal' && msg.type !== 'relay') || !msg.data || typeof msg.data !== 'object') return
      if (role === 'host' && typeof msg.peerId === 'string') {
        send(session.guests.get(msg.peerId)?.socket ?? null, { type: msg.type, peerId: 'host', data: msg.data })
      } else if (role === 'guest' && guest) {
        // Never trust an incoming peerId; guests can address only their host.
        send(session.host, { type: msg.type, peerId: guest.id, data: msg.data })
      }
    })
    socket.on('close', () => {
      clearTimeout(joinTimeout)
      sockets.delete(socket)
      alive.delete(socket)
      if (role === 'host' && session.host === socket) {
        session.host = null
        for (const g of session.guests.values()) send(g.socket, { type: 'host_status', online: false })
      } else if (guest && guest.socket === socket) {
        guest.socket = null
        send(session.host, { type: 'guest_left', peerId: guest.id })
      }
    })
  })

  const cleanup = setInterval(() => {
    for (const session of sessions.values()) if (session.expiresAt <= Date.now()) end(session)
    for (const [ip, attempt] of attempts) if (attempt.until <= Date.now()) attempts.delete(ip)
    for (const socket of sockets) {
      if (!alive.has(socket)) { socket.terminate(); continue }
      alive.delete(socket)
      socket.ping()
    }
  }, 25000)
  cleanup.unref()
  fastify.addHook('onClose', async () => {
    clearInterval(cleanup)
    for (const socket of sockets) socket.terminate()
    sessions.clear()
  })
}

export default desktopRoutes
