import Fastify from 'fastify'
import cors from '@fastify/cors'
import sessionsRoutes from './routes/sessions.js'
import wsPlugin from './ws.js'

const PORT = Number(process.env['PORT'] ?? 4545)
const HOST = process.env['HOST'] ?? '0.0.0.0'

const fastify = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
})

await fastify.register(cors, {
  origin: process.env['CORS_ORIGIN'] ?? true,
})

await fastify.register(sessionsRoutes)
await fastify.register(wsPlugin)

fastify.get('/health', async () => ({ status: 'ok' }))

try {
  await fastify.listen({ port: PORT, host: HOST })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
