import { cp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSigningIdentity } from '../../desktop/scripts/local-signing.mjs'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const bundle = resolve('build/Nextslide.app')
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const release = process.argv.includes('--release')
let running = false
try { execFileSync('pgrep', ['-f', `${bundle}/Contents/MacOS/Nextslide`], { stdio: 'ignore' }); running = true } catch {}
if (running) throw new Error('Quit the native Nextslide app before replacing its bundle.')
await rm(bundle, { recursive: true, force: true })
await mkdir(`${bundle}/Contents/MacOS`, { recursive: true })
await cp('build/resources', `${bundle}/Contents/Resources`, { recursive: true })
const bin = execFileSync('swift', ['build', '-c', process.argv.includes('--debug') ? 'debug' : 'release', '--show-bin-path'], { encoding: 'utf8' }).trim()
await cp(`${bin}/Nextslide`, `${bundle}/Contents/MacOS/Nextslide`)
await writeFile(`${bundle}/Contents/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.nextslide.desktop</string>
<key>CFBundleName</key><string>Nextslide</string>
<key>CFBundleDisplayName</key><string>Nextslide</string>
<key>CFBundleExecutable</key><string>Nextslide</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>2</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>Nextslide contributors</string>
</dict></plist>\n`)

// Signing. Three modes, in order of preference:
//   1. --release (or NEXTSLIDE_SIGNING_IDENTITY set): Developer ID Application certificate
//      from the login keychain, hardened runtime, secure timestamp. Notarized afterwards when
//      a notarytool keychain profile exists (NEXTSLIDE_NOTARY_PROFILE, default "nextslide").
//      No entitlements are needed: the app spawns Chrome and cloudflared as plain subprocesses,
//      uses no JIT or plug-ins, and is not sandboxed. Accessibility and notifications are TCC grants.
//   2. Otherwise: the persistent local development certificate (see local-signing.mjs).
const developerId = () => {
  const out = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  return out.match(/"(Developer ID Application: [^"]+)"/)?.[1]
}
let signing
try {
  if (process.env.NEXTSLIDE_SIGNING_IDENTITY) signing = { identity: process.env.NEXTSLIDE_SIGNING_IDENTITY, distribution: true }
  else if (release) {
    const identity = developerId()
    if (!identity) throw new Error('No "Developer ID Application" certificate is installed. Create one at developer.apple.com or set NEXTSLIDE_SIGNING_IDENTITY.')
    signing = { identity, distribution: true }
  } else signing = await localSigningIdentity()
  const flags = ['--force', '--sign', signing.identity,
    ...(signing.distribution ? ['--options', 'runtime', '--timestamp'] : ['--timestamp=none']),
    ...(signing.keychain ? ['--keychain', signing.keychain] : [])]
  execFileSync('codesign', [...flags, `${bundle}/Contents/Resources/cloudflared`], { stdio: 'inherit' })
  execFileSync('codesign', [...flags, bundle], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle], { stdio: 'inherit' })
  console.log(`Signed ${bundle} with "${signing.identity}"`)
} finally { signing?.lock?.() }

if (signing.distribution) {
  // Distributable archive. ditto preserves the bundle's resource forks and signatures.
  const archive = resolve(`build/Nextslide-${version}.zip`)
  await rm(archive, { force: true })
  execFileSync('ditto', ['-c', '-k', '--keepParent', bundle, archive], { stdio: 'inherit' })
  const profile = process.env.NEXTSLIDE_NOTARY_PROFILE ?? 'nextslide'
  let hasProfile = false
  try { execFileSync('xcrun', ['notarytool', 'history', '--keychain-profile', profile], { stdio: 'ignore' }); hasProfile = true } catch {}
  if (hasProfile) {
    execFileSync('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', profile, '--wait'], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'staple', bundle], { stdio: 'inherit' })
    await rm(archive, { force: true })
    execFileSync('ditto', ['-c', '-k', '--keepParent', bundle, archive], { stdio: 'inherit' })
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle], { stdio: 'inherit' })
    console.log(`Notarized and stapled. Distributable: ${archive}`)
  } else {
    console.log(`Not notarized: no notarytool keychain profile "${profile}". Create one with:\n  xcrun notarytool store-credentials ${profile} --apple-id <apple-id> --team-id <team-id>\nthen rerun. Unnotarized archive: ${archive}`)
  }
}
