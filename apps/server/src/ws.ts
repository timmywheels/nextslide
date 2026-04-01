import type { FastifyPluginAsync } from 'fastify'
import websocketPlugin from '@fastify/websocket'
import type { WebSocket } from '@fastify/websocket'
import type { ClientMessage, ServerMessage } from '@nextslide/types'
import { customAlphabet } from 'nanoid'
import {
  broadcastToSession,
  getParticipantCount,
  getParticipants,
  getSession,
  touchSession,
  type Session,
} from './sessions.js'

const PING_INTERVAL_MS = 30_000
const MAX_MISSED_PINGS = 2
const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

type ConnectionState = {
  role: 'presenter' | 'speaker' | null
  session: Session | null
  participantId: string | null
  clientId: string | null
  missedPings: number
  joined: boolean
}

const allStates = new Map<WebSocket, ConnectionState>()

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function parseMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null
    return parsed as ClientMessage
  } catch {
    return null
  }
}

function removeFromSession(socket: WebSocket, state: ConnectionState): void {
  if (!state.session || !state.joined) return

  if (state.role === 'presenter') {
    state.session.presenterSocket = null
  } else if (state.role === 'speaker' && state.participantId) {
    if (state.clientId) state.session.clientIndex.delete(state.clientId)
    state.session.speakers.delete(state.participantId)
  }

  touchSession(state.session)
  broadcastToSession(state.session, {
    type: 'participant_update',
    count: getParticipantCount(state.session),
    participants: getParticipants(state.session),
  })
  state.joined = false
}

const wsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocketPlugin)

  fastify.get('/ws/:code', { websocket: true }, (socket, request) => {
    const { code } = request.params as { code: string }

    const state: ConnectionState = {
      role: null,
      session: null,
      participantId: null,
      clientId: null,
      missedPings: 0,
      joined: false,
    }

    allStates.set(socket, state)

    socket.on('message', (rawData: Buffer | ArrayBuffer | Buffer[]) => {
      const message = parseMessage(rawData.toString())
      if (!message) return

      if (!state.joined) {
        if (message.type !== 'join') {
          send(socket, { type: 'error', message: 'session_not_found' })
          socket.close()
          return
        }

        const session = getSession(code)
        if (!session) {
          send(socket, { type: 'error', message: 'session_not_found' })
          socket.close()
          return
        }

        const name = message.name?.trim() || (message.role === 'presenter' ? 'Presenter' : 'Speaker')

        if (message.role === 'presenter') {
          const existing = session.presenterSocket
          if (existing !== null) {
            if (existing.readyState === existing.OPEN) {
              // Genuinely already connected — reject
              send(socket, { type: 'error', message: 'presenter_already_connected' })
              socket.close()
              return
            }
            // Stale dead socket — evict it and let this connection take over
            existing.terminate()
            session.presenterSocket = null
            allStates.delete(existing)
          }
          session.presenterSocket = socket
          session.presenterName = name
          state.role = 'presenter'
          state.participantId = 'presenter'
        } else {
          // Evict any previous connection with the same clientId (e.g. page refresh)
          const incomingClientId = 'clientId' in message ? (message.clientId as string | undefined) : undefined
          if (incomingClientId) {
            const prevId = session.clientIndex.get(incomingClientId)
            if (prevId) {
              const prev = session.speakers.get(prevId)
              if (prev) {
                const prevState = allStates.get(prev.socket)
                if (prevState) prevState.joined = false // suppress double-broadcast on close
                prev.socket.terminate()
                session.speakers.delete(prevId)
              }
              session.clientIndex.delete(incomingClientId)
            }
          }

          const id = generateId()
          session.speakers.set(id, { id, name, socket, clientId: incomingClientId })
          if (incomingClientId) session.clientIndex.set(incomingClientId, id)
          state.role = 'speaker'
          state.participantId = id
          state.clientId = incomingClientId ?? null
        }

        state.session = session
        state.joined = true
        touchSession(session)

        send(socket, {
          type: 'joined',
          participantCount: getParticipantCount(session),
          participants: getParticipants(session),
        })
        broadcastToSession(session, {
          type: 'participant_update',
          count: getParticipantCount(session),
          participants: getParticipants(session),
        })
        return
      }

      if (!state.session) return
      touchSession(state.session)

      if (message.type === 'pong') {
        state.missedPings = 0
        return
      }

      if (message.type === 'command') {
        if (state.role !== 'speaker') return
        const presenter = state.session.presenterSocket
        if (!presenter || presenter.readyState !== presenter.OPEN) {
          send(socket, { type: 'error', message: 'no_presenter' })
          return
        }
        send(presenter, { type: 'command', command: message.command })
      }
    })

    socket.on('close', () => {
      allStates.delete(socket)
      removeFromSession(socket, state)
    })

    socket.on('error', () => {
      allStates.delete(socket)
      removeFromSession(socket, state)
    })
  })
}

setInterval(() => {
  for (const [socket, state] of allStates) {
    if (socket.readyState !== socket.OPEN) {
      allStates.delete(socket)
      continue
    }
    if (state.missedPings >= MAX_MISSED_PINGS) {
      socket.terminate()
      allStates.delete(socket)
      removeFromSession(socket, state)
      continue
    }
    state.missedPings += 1
    send(socket, { type: 'ping' })
  }
}, PING_INTERVAL_MS).unref()

export default wsPlugin
