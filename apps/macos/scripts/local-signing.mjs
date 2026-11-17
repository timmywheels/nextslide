import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// Ad-hoc signing pins a TCC grant to one build's cdhash. Reuse a certificate
// instead, so local updates satisfy the same certificate-anchored requirement.
// This keychain is specific to Nextslide development. It is not made a default
// keychain, and the certificate is never added to the system's trusted roots.
export async function localSigningIdentity() {
  const directory = join(homedir(), 'Library/Application Support/Nextslide/Signing')
  const keychain = join(directory, 'development.keychain-db')
  const config = join(directory, 'identity.json')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const run = (tool, args) => {
    try { return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
    // Never include command arguments: security receives a generated password.
    catch (error) {
      const reason = String(error.stderr ?? '').split('\n').filter(line => line.startsWith('security:')).join(' ').replace(/\b[a-f0-9]{64}\b/gi, '[redacted]')
      throw new Error(`Local signing setup failed in ${tool} ${args[0]}: ${reason}. Signing files are in ${directory}; existing identities have been preserved.`)
    }
  }
  let settings
  try { settings = JSON.parse(await readFile(config, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!settings) {
    // Do not silently rotate an existing identity if setup was interrupted.
    let exists = false
    try { await access(keychain); exists = true } catch {}
    if (exists) throw new Error(`An incomplete local signing setup exists at ${directory}. Restore identity.json before packaging; do not rotate a granted identity.`)
    const temporary = await mkdtemp(join(tmpdir(), 'nextslide-signing-'))
    const password = randomBytes(32).toString('hex')
    const cert = join(directory, 'development.pem')
    const key = join(temporary, 'development.key')
    const p12 = join(temporary, 'development.p12')
    const extensions = join(temporary, 'certificate.conf')
    const searchList = [...run('/usr/bin/security', ['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(match => match[1])
    let createdKeychain = false
    try {
      await writeFile(extensions, '[req]\nprompt=no\ndistinguished_name=subject\nx509_extensions=signing\n[subject]\nCN=Nextslide Local Development\n[signing]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n', { mode: 0o600 })
      run('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-config', extensions, '-keyout', key, '-out', cert])
      run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', key, '-in', cert, '-name', 'Nextslide Local Development', '-out', p12, '-passout', `pass:${password}`])
      try { run('/usr/bin/security', ['create-keychain', '-p', password, keychain]); createdKeychain = true }
      finally { run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...searchList]) }
      run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain])
      run('/usr/bin/security', ['import', p12, '-f', 'pkcs12', '-k', keychain, '-P', password, '-x', '-T', '/usr/bin/codesign'])
      run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain])
      const identity = run('/usr/bin/openssl', ['x509', '-in', cert, '-noout', '-fingerprint', '-sha1']).split('=').at(-1).replaceAll(':', '')
      if (!/^[A-F0-9]{40}$/.test(identity)) throw new Error('Could not read the local signing certificate fingerprint.')
      settings = { identity, password }
      await writeFile(config, JSON.stringify(settings), { mode: 0o600, flag: 'wx' })
      console.log('Created a persistent signing identity for local Nextslide builds.')
    } catch (error) {
      if (createdKeychain) run('/usr/bin/security', ['lock-keychain', keychain])
      throw error
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  if (!/^[A-F0-9]{40}$/.test(settings.identity) || !/^[a-f0-9]{64}$/.test(settings.password)) throw new Error('Invalid local signing configuration.')
  await chmod(config, 0o600)
  run('/usr/bin/security', ['unlock-keychain', '-p', settings.password, keychain])
  return {
    identity: settings.identity, keychain,
    lock: () => run('/usr/bin/security', ['lock-keychain', keychain]),
  }
}
