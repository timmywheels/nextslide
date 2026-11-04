import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeControl } from '../src/native.js'

test('grant and revoke refresh a cached helper without losing concurrent requests or the chosen target', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nextslide-permission-'))
  const permission = join(dir, 'permission')
  const executable = join(dir, 'helper.cjs')
  await writeFile(permission, 'false')
  // Deliberately emulate macOS's process-local permission cache. Only a new
  // process sees the changed setting; no actual macOS permission is modified.
  await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const trusted = fs.readFileSync(${JSON.stringify(permission)}, 'utf8') === 'true';
if (process.argv.includes('--permission-status')) { console.log(trusted); process.exit(0); }
readline.createInterface({input:process.stdin}).on('line', line => {
  const req = JSON.parse(line);
  const result = {id:req.id, trusted, running:true, frontmost:true, target:req.pid, worker:process.pid, ok:true};
  setTimeout(() => console.log(JSON.stringify(result)), req.delay || 0);
});
`, { mode: 0o755 })
  const helper = new NativeControl(executable, 0)
  t.after(async () => { helper.close(); await rm(dir, { recursive: true, force: true }) })
  assert.equal((await helper.status({ pid: 123 })).trusted, false)
  const initial = await helper.request<{ worker: number }>('status')
  await writeFile(permission, 'true')
  const [status, listed, sent] = await Promise.all([
    helper.status({ pid: 123 }),
    helper.request<{ ok: boolean }>('list'),
    helper.request<{ ok: boolean }>('send', { delay: 50 }),
  ])
  assert.equal(status.trusted, true)
  assert.equal(listed.ok, true)
  assert.equal(sent.ok, true)
  const refreshed = await helper.request<{ worker: number; target: number }>('status', { pid: 123 })
  assert.notEqual(refreshed.worker, initial.worker)
  assert.equal(refreshed.target, 123)
  await writeFile(permission, 'false')
  assert.equal((await helper.status({ pid: 123 })).trusted, false)
  helper.close()
  await assert.rejects(helper.status(), /unavailable/)
})
