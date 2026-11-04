import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import desktopRoutes from '../src/desktop.js'
import legacyRoutes from '../src/routes/sessions.js'
import legacyWS from '../src/ws.js'

class Client {
  ws: WebSocket
  queue: any[] = []
  waiters: { type: string; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }[] = []
  ready: Promise<void>
  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', () => reject(new Error('WebSocket failed')), { once: true })
    })
    this.ws.addEventListener('message', event => {
      const value = JSON.parse(String(event.data))
      const index = this.waiters.findIndex(w => w.type === value.type)
      if (index < 0) this.queue.push(value)
      else { const waiter = this.waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(value) }
    })
  }
  send(message: object) { this.ws.send(JSON.stringify(message)) }
  next(type: string): Promise<any> {
    const index = this.queue.findIndex(value => value.type === type)
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${type} message received`)), 2500)
      this.waiters.push({ type, resolve, reject, timer })
    })
  }
  close() { this.ws.close(); for (const w of this.waiters) clearTimeout(w.timer) }
}

test('desktop sessions authenticate roles, route only through the host, resume identity, and revoke invites', async t => {
  const server = Fastify()
  await server.register(websocket, { options: { maxPayload: 16384 } })
  await server.register(desktopRoutes)
  const address = await server.listen({ port: 0, host: '127.0.0.1' })
  const clients: Client[] = []
  t.after(async () => { clients.forEach(c => c.close()); await server.close() })
  const session = (await server.inject({ method: 'POST', url: '/api/desktop/sessions' })).json()
  assert.ok(session.hostToken !== session.inviteToken)
  const connect = async (hello: object) => {
    const client = new Client(`${address.replace('http', 'ws')}/ws/desktop/${session.id}`)
    clients.push(client); await client.ready; client.send({ type: 'hello', ...hello }); return client
  }
  const impostor = await connect({ role: 'host', token: session.inviteToken })
  assert.match((await impostor.next('error')).error, /invalid/)
  const host = await connect({ role: 'host', token: session.hostToken })
  assert.equal((await host.next('welcome')).peerId, 'host')
  const guest = await connect({ role: 'guest', token: session.inviteToken, name: 'Taylor' })
  const welcome = await guest.next('welcome')
  assert.equal((await host.next('guest_joined')).guest.name, 'Taylor')
  assert.equal((await guest.next('host_status')).online, true)
  guest.send({ type: 'signal', peerId: 'forged', data: { description: { type: 'offer', sdp: 'test' } } })
  assert.equal((await host.next('signal')).peerId, welcome.peerId)
  host.send({ type: 'relay', peerId: welcome.peerId, data: { type: 'state', enabled: true } })
  assert.equal((await guest.next('relay')).data.enabled, true)
  guest.send({ type: 'end' })
  guest.send({ type: 'relay', data: { type: 'command', id: 'command-0000000001' } })
  assert.equal((await host.next('relay')).peerId, welcome.peerId)
  guest.close()
  assert.equal((await host.next('guest_left')).peerId, welcome.peerId)
  const resumed = await connect({ role: 'guest', token: session.inviteToken, name: 'Taylor', resumeToken: welcome.resumeToken })
  assert.equal((await resumed.next('welcome')).peerId, welcome.peerId)
  assert.equal((await server.inject({ method: 'DELETE', url: `/api/desktop/sessions/${session.id}`, headers: { authorization: `Bearer ${session.inviteToken}` } })).statusCode, 403)
  assert.equal((await server.inject({ method: 'DELETE', url: `/api/desktop/sessions/${session.id}`, headers: { authorization: `Bearer ${session.hostToken}` } })).statusCode, 204)
  assert.equal((await resumed.next('ended')).type, 'ended')
  const expired = new Client(`${address.replace('http', 'ws')}/ws/desktop/${session.id}`)
  clients.push(expired)
  assert.equal((await expired.next('ended')).type, 'ended')
})

test('existing extension WebSockets still forward commands with shared registration', async t => {
  const server = Fastify()
  await server.register(websocket)
  await server.register(legacyRoutes)
  await server.register(legacyWS)
  await server.register(desktopRoutes)
  const address = await server.listen({ port: 0, host: '127.0.0.1' })
  const code = (await server.inject({ method: 'POST', url: '/api/sessions' })).json().code
  const host = new Client(`${address.replace('http', 'ws')}/ws/${code}`)
  const guest = new Client(`${address.replace('http', 'ws')}/ws/${code}`)
  t.after(async () => { host.close(); guest.close(); await server.close() })
  await Promise.all([host.ready, guest.ready])
  host.send({ type: 'join', role: 'presenter' }); await host.next('joined')
  guest.send({ type: 'join', role: 'speaker', name: 'Legacy' }); await guest.next('joined')
  guest.send({ type: 'command', command: 'next' })
  assert.equal((await host.next('command')).command, 'next')
})
