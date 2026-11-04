import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { localHostServer } from '../src/public-host'

test('the public service exposes remotes but requires a local host secret to create a session', async () => {
  const server = await localHostServer(resolve('../web/dist'), 'private-test-secret')
  try {
    assert.equal((await server.inject({ method: 'POST', url: '/api/desktop/sessions' })).statusCode, 403)
    const created = await server.inject({ method: 'POST', url: '/api/desktop/sessions', headers: { 'x-nextslide-host': 'private-test-secret' } })
    assert.equal(created.statusCode, 200)
    const session = created.json()
    const remote = await server.inject(`/r/${session.id}`)
    assert.equal(remote.statusCode, 200)
    assert.equal(remote.headers['content-type'], 'text/html; charset=utf-8')
    assert.equal((await server.inject('/browser.sock')).statusCode, 404)
    assert.equal((await server.inject({ method: 'DELETE', url: `/api/desktop/sessions/${session.id}` })).statusCode, 403)
    assert.equal((await server.inject({ method: 'DELETE', url: `/api/desktop/sessions/${session.id}`, headers: { authorization: `Bearer ${session.hostToken}` } })).statusCode, 204)
  } finally { await server.close() }
})
