import type { FastifyPluginAsync } from 'fastify'
import {
  createSession,
  deleteSession,
  getParticipantCount,
  getParticipants,
  getSession,
} from '../sessions.js'
import type { CreateSessionResponse, SessionStatusResponse } from '@nextslide/types'

const BASE_URL = (process.env['BASE_URL'] ?? 'http://localhost:4545').replace(/\/$/, '')

const sessionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/sessions', async (_request, reply) => {
    let session
    try {
      session = createSession()
    } catch (err) {
      if (err instanceof Error && err.message === 'MAX_SESSIONS_REACHED') {
        return reply.code(503).send({ message: 'Server is at capacity. Try again later.' })
      }
      throw err
    }

    const body: CreateSessionResponse = {
      code: session.code,
      presenterUrl: `${BASE_URL}/presenter/${session.code}`,
      audienceUrl: `${BASE_URL}/s/${session.code}`,
    }

    return reply.code(200).send(body)
  })

  fastify.get<{ Params: { code: string } }>(
    '/api/sessions/:code',
    async (request, reply) => {
      const { code } = request.params
      const session = getSession(code)

      const body: SessionStatusResponse = session
        ? { exists: true, participantCount: getParticipantCount(session), participants: getParticipants(session) }
        : { exists: false, participantCount: 0, participants: [] }

      return reply.code(200).send(body)
    },
  )

  fastify.delete<{ Params: { code: string } }>(
    '/api/sessions/:code',
    async (request, reply) => {
      const { code } = request.params
      deleteSession(code)
      return reply.code(204).send()
    },
  )
}

export default sessionsRoutes
