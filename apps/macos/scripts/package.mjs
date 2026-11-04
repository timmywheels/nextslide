import { cp, mkdir, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSigningIdentity } from '../../desktop/scripts/local-signing.mjs'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const bundle = resolve('build/Nextslide.app')
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
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>CFBundleVersion</key><string>2</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>Nextslide contributors</string>
</dict></plist>\n`)
let signing
try {
  signing = process.env.NEXTSLIDE_SIGNING_IDENTITY ? { identity: process.env.NEXTSLIDE_SIGNING_IDENTITY } : await localSigningIdentity()
  const flags = ['--force', '--sign', signing.identity, '--timestamp=none', ...(signing.keychain ? ['--keychain', signing.keychain] : [])]
  execFileSync('codesign', [...flags, `${bundle}/Contents/Resources/cloudflared`], { stdio: 'inherit' })
  execFileSync('codesign', [...flags, bundle], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' })
  console.log(`Built and verified ${bundle}`)
} finally { signing?.lock?.() }
