import { WebSocket } from '@fastify/websocket'
import { customAlphabet } from 'nanoid'
import type { Participant, ServerMessage } from '@nextslide/types'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const generateCode = customAlphabet(CODE_ALPHABET, CODE_LENGTH)

const SESSION_TTL_HOURS = Number(process.env['SESSION_TTL_HOURS'] ?? 4)
const MAX_SESSIONS = Number(process.env['MAX_SESSIONS'] ?? 1000)
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

export type AudienceMember = {
  id: string
  name: string
  socket: WebSocket
  clientId?: string
}

export type Session = {
  code: string
  presenterSocket: WebSocket | null
  presenterName: string
  audienceMembers: Map<string, AudienceMember> // id → member
  clientIndex: Map<string, string>             // clientId → participantId
  lastActivityAt: number
}

const sessions = new Map<string, Session>()

export function createSession(): Session {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('MAX_SESSIONS_REACHED')
  }

  let code: string
  do {
    code = generateCode()
  } while (sessions.has(code))

  const session: Session = {
    code,
    presenterSocket: null,
    presenterName: 'Presenter',
    audienceMembers: new Map(),
    clientIndex: new Map(),
    lastActivityAt: Date.now(),
  }

  sessions.set(code, session)
  return session
}

export function getSession(code: string): Session | undefined {
  return sessions.get(code.toUpperCase())
}

export function deleteSession(code: string): void {
  const session = sessions.get(code.toUpperCase())
  if (!session) return

  const closeMsg: ServerMessage = { type: 'error', message: 'session_not_found' }
  const closePayload = JSON.stringify(closeMsg)

  const ps = session.presenterSocket
  if (ps && ps.readyState === ps.OPEN) {
    ps.close(1000, closePayload)
  }

  for (const member of session.audienceMembers.values()) {
    if (member.socket.readyState === member.socket.OPEN) {
      member.socket.close(1000, closePayload)
    }
  }

  sessions.delete(code.toUpperCase())
}

export function touchSession(session: Session): void {
  session.lastActivityAt = Date.now()
}

export function getParticipantCount(session: Session): number {
  return (session.presenterSocket ? 1 : 0) + session.audienceMembers.size
}

export function getParticipants(session: Session): Participant[] {
  const result: Participant[] = []
  if (session.presenterSocket) {
    result.push({ id: 'presenter', name: session.presenterName, role: 'presenter' })
  }
  for (const member of session.audienceMembers.values()) {
    result.push({ id: member.id, name: member.name, role: 'audience' })
  }
  return result
}

export function broadcastToSession(session: Session, message: ServerMessage): void {
  const payload = JSON.stringify(message)

  const ps = session.presenterSocket
  if (ps && ps.readyState === ps.OPEN) {
    ps.send(payload)
  }

  for (const member of session.audienceMembers.values()) {
    if (member.socket.readyState === member.socket.OPEN) {
      member.socket.send(payload)
    }
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [code, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      deleteSession(code)
    }
  }
}, CLEANUP_INTERVAL_MS).unref()
