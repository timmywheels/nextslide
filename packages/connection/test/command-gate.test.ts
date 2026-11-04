import test from 'node:test'
import assert from 'node:assert/strict'
import { CommandGate, serviceURL } from '../src/protocol.js'

const command = (id = 'command-0000000001', expiresAt = 11000) => ({ type: 'command', id, direction: 'next', expiresAt })

test('a command received through both transports is dispatched once, even while in flight', async () => {
  const gate = new CommandGate()
  let calls = 0
  let release!: () => void
  const work = new Promise<void>(resolve => { release = resolve })
  const dispatch = async () => { calls++; await work }
  const first = gate.execute(command(), true, dispatch, 10000)
  const duplicate = gate.execute(command(), true, dispatch, 10001)
  assert.equal(first, duplicate)
  await Promise.resolve()
  assert.equal(calls, 1)
  release()
  assert.equal((await first)?.ok, true)
  assert.equal((await gate.execute(command(), true, dispatch, 10002))?.ok, true)
  assert.equal(calls, 1)
})

test('unapproved, expired, future-dated and malformed commands never reach the app', async () => {
  let calls = 0
  const dispatch = async () => { calls++ }
  for (const [value, allowed] of [[command(), false], [command(undefined, 9999), true], [command(undefined, 16000), true]] as const) {
    assert.equal((await new CommandGate().execute(value, allowed, dispatch, 10000))?.ok, false)
  }
  for (const value of [null, {}, { ...command(), direction: 'shell' }, { ...command(), expiresAt: NaN }, { ...command(), id: 'short' }]) {
    assert.equal(new CommandGate().execute(value, true, dispatch, 10000), null)
  }
  assert.equal(calls, 0)
})

test('native failures are acknowledged and never replayed; rapid distinct clicks are limited', async () => {
  const gate = new CommandGate()
  let calls = 0
  const dispatch = async () => { calls++; throw new Error('Bring your presentation to the front.') }
  const result = await gate.execute(command(), true, dispatch, 10000)
  assert.equal(result?.ok, false)
  assert.match(result?.error ?? '', /front/)
  await gate.execute(command(), true, dispatch, 10020)
  assert.equal((await gate.execute(command('command-0000000002'), true, dispatch, 10030))?.ok, false)
  assert.equal(calls, 1)
})

test('service configuration accepts secure public origins and local development only', () => {
  assert.equal(serviceURL('https://nextslide.app/'), 'https://nextslide.app')
  assert.equal(serviceURL('http://127.0.0.1:4545'), 'http://127.0.0.1:4545')
  assert.equal(serviceURL('http://192.168.1.5:4545'), 'http://192.168.1.5:4545')
  for (const value of ['http://example.com', 'file:///tmp/test', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/#secret']) assert.throws(() => serviceURL(value))
})
