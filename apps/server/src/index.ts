import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

// Serve the web app static files when the dist directory exists (production)
const webDistDir = process.env['STATIC_DIR'] ?? join(process.cwd(), 'apps/web/dist')
if (existsSync(webDistDir)) {
  await fastify.register(staticPlugin, { root: webDistDir, prefix: '/', wildcard: false })
  fastify.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile('index.html')
  })
}

try {
  await fastify.listen({ port: PORT, host: HOST })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
