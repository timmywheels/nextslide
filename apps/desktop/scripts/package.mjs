import { packager } from '@electron/packager'
import { cp, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { localSigningIdentity } from './local-signing.mjs'
const stage = await mkdtemp(join(tmpdir(), 'nextslide-package-'))
let signing
try {
  // Replacing a running bundle makes macOS validate an old process against
  // new files. Stop it first, while its current signature is still intact.
  let running = false
  try { execFileSync('/usr/bin/pgrep', ['-x', 'Nextslide'], { stdio: 'ignore' }); running = true } catch {}
  if (running) throw new Error('Quit Nextslide before packaging a new build.')
  signing = process.env.NEXTSLIDE_SIGNING_IDENTITY
    ? { identity: process.env.NEXTSLIDE_SIGNING_IDENTITY }
    : await localSigningIdentity()
  await cp('dist', join(stage, 'dist'), { recursive: true })
  await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'nextslide', productName: 'Nextslide', version: '0.1.0', main: 'dist/main.cjs' }))
  await mkdir('build', { recursive: true })
  const paths = await packager({
    dir: stage, name: 'Nextslide', platform: 'darwin', arch: process.arch, electronVersion: '45.2.2',
    out: resolve('build'), overwrite: true, appBundleId: 'app.nextslide.desktop',
    icon: resolve('dist/app.icns'),
    extendInfo: { LSUIElement: true, NSHumanReadableCopyright: 'Nextslide contributors' },
    // A persistent certificate keeps TCC's identity stable across rebuilds.
    osxSign: {
      identity: signing.identity, keychain: signing.keychain,
      identityValidation: false, continueOnError: false,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false,
      optionsForFile: file => ({
        hardenedRuntime: false, timestamp: 'none',
        entitlements: ['/slide-control', '/cloudflared'].some(name => file.endsWith(name)) ? [] : ['com.apple.security.cs.allow-jit'],
      }),
    },
    // Leave the native helper outside an archive so it can execute normally.
    asar: false,
  })
  for (const path of paths) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', join(path, 'Nextslide.app')], { stdio: 'inherit' })
    console.log(`Built and verified ${path}/Nextslide.app`)
  }
} finally {
  try { signing?.lock?.() }
  finally { await rm(stage, { recursive: true, force: true }) }
}
