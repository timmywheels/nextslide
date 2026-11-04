import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import websocket from '@fastify/websocket'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import desktopRoutes from '../../server/src/desktop'

export type HostingAddress = { service: string; inviteOrigin: string; createToken?: string }

export async function localHostServer(webRoot: string, createToken: string): Promise<FastifyInstance> {
  const server = Fastify({ logger: false })
  await server.register(cors, { origin: 'null', allowedHeaders: ['Content-Type', 'Authorization', 'X-Nextslide-Host'] })
  server.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || request.url !== '/api/desktop/sessions') return
    const token = request.headers['x-nextslide-host']
    if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(createToken) || !timingSafeEqual(Buffer.from(token), Buffer.from(createToken))) {
      return reply.code(403).send({ error: 'Start sessions from the Nextslide menu bar app.' })
    }
  })
  await server.register(websocket, { options: { maxPayload: 16384 } })
  await server.register(desktopRoutes)
  server.get('/health', async () => ({ status: 'ok' }))
  await server.register(staticPlugin, { root: webRoot, wildcard: false })
  server.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET' && /^\/r\/[A-Za-z0-9_-]+(?:\?.*)?$/.test(request.url)) return reply.sendFile('index.html')
    return reply.code(404).send({ error: 'Not found' })
  })
  return server
}

export class PublicHost {
  private server?: FastifyInstance
  private tunnel?: ChildProcess
  private address?: HostingAddress
  private starting?: Promise<HostingAddress>
  private stopping = false
  private abort?: AbortController
  constructor(private resources: string, private failed: (message: string) => void) {}

  start(): Promise<HostingAddress> {
    if (this.address) return Promise.resolve(this.address)
    if (this.starting) return this.starting
    this.stopping = false
    this.abort = new AbortController()
    this.starting = this.open(this.abort.signal).catch(async error => { await this.stop(); throw error }).finally(() => { this.starting = undefined })
    return this.starting
  }

  private async open(signal: AbortSignal): Promise<HostingAddress> {
    const createToken = randomBytes(32).toString('base64url')
    const server = await localHostServer(join(this.resources, 'remote'), createToken)
    this.server = server
    const service = await server.listen({ port: 0, host: '127.0.0.1' })
    if (signal.aborted) throw new Error('Session cancelled.')
    const tunnel = spawn(join(this.resources, 'cloudflared'), ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', service], { stdio: ['ignore', 'ignore', 'pipe'] })
    this.tunnel = tunnel
    const inviteOrigin = await new Promise<string>((resolve, reject) => {
      let text = ''
      let detectedURL: string | undefined
      let settled = false
      const timer = setTimeout(() => finish(new Error('Could not open the public tunnel. Check your internet connection and try again.')), 30000)
      const finish = (error?: Error, url?: string) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancelled); error ? reject(error) : resolve(url!) }
      const cancelled = () => finish(new Error('Session cancelled.'))
      signal.addEventListener('abort', cancelled, { once: true })
      tunnel.stderr!.on('data', chunk => {
        if (process.env.NEXTSLIDE_DEBUG_TUNNEL === '1') process.stderr.write(chunk)
        text = (text + chunk.toString()).slice(-8192)
        detectedURL ??= text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0]
        if (detectedURL && text.includes('Registered tunnel connection')) finish(undefined, detectedURL)
      })
      tunnel.once('error', () => finish(new Error('The tunnel helper could not start. Reinstall Nextslide.')))
      tunnel.once('exit', () => {
        finish(new Error('The public tunnel stopped. Start a new session.'))
        if (!this.stopping && this.address) { this.address = undefined; this.failed('The public tunnel stopped. Start a new session to create a new invite.'); void this.stop() }
      })
    })
    if (process.env.NEXTSLIDE_DEBUG_TUNNEL === '1') console.log('Checking public tunnel', inviteOrigin)
    // The hostname can appear before its DNS record and edge route are ready.
    // Never offer an invite until the public service is reachable.
    // An immediate lookup can negatively cache the not-yet-published hostname.
    await new Promise(resolve => setTimeout(resolve, 2000))
    let reachable = false
    let reason = ''
    const deadline = Date.now() + 60000
    while (Date.now() < deadline && !signal.aborted) {
      try {
        const response = await fetch(`${inviteOrigin}/health`, { signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) })
        if (response.ok && (await response.json() as { status?: string }).status === 'ok') { reachable = true; break }
        reason = `HTTP ${response.status}`
      } catch (error) {
        reason = error instanceof Error ? error.message : 'Network error'
        if (process.env.NEXTSLIDE_DEBUG_TUNNEL === '1') console.log('Tunnel check', reason, (error as { cause?: { code?: string } }).cause?.code)
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    if (!reachable || signal.aborted || tunnel.exitCode !== null) throw new Error(`The public link did not become reachable${reason ? ` (${reason})` : ''}. Please try starting again.`)
    this.address = { service, inviteOrigin, createToken }
    return this.address
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.abort?.abort()
    this.address = undefined
    const tunnel = this.tunnel
    this.tunnel = undefined
    if (tunnel && tunnel.exitCode === null) {
      tunnel.kill('SIGTERM')
      const kill = setTimeout(() => { if (tunnel.exitCode === null) tunnel.kill('SIGKILL') }, 2000)
      kill.unref()
    }
    const server = this.server
    this.server = undefined
    await server?.close()
  }
}
