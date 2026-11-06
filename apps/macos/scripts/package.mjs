import { cp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSigningIdentity } from '../../desktop/scripts/local-signing.mjs'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const bundle = resolve('build/Nextslide.app')
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const release = process.argv.includes('--release')
const sparkleArtifacts = resolve('.build/artifacts/sparkle/Sparkle')
const sparkleAccount = 'nextslide'
const sparklePublicKey = 'J4+PX4S723GfionQRnnhmO01IsUutDvIf7xE/7Vn8pQ='
const feedUrl = 'https://nextslide.app/appcast.xml'
// Pinned so release builds are reproducible. Cloudflare's release notes publish the extracted binary's hash, not the archive's.
const cloudflared = { version: '2026.10.7', x86_64: ['amd64', '5c55e77da7012cebca19170357e196176c48c9647cc2ead404702fa125ddbd86'], arm64: ['arm64', '2136431d5eb467bf447d2ee514b713e192719b143aec1d9e09bf7dc290d5bb12'] }
const universalCloudflared = async () => {
  const dir = resolve(`build/cloudflared-${cloudflared.version}`)
  const slices = []
  for (const arch of ['x86_64', 'arm64']) {
    const [name, sha256] = cloudflared[arch]
    const archive = `${dir}/${name}.tgz`
    await mkdir(`${dir}/${name}`, { recursive: true })
    let bytes = await readFile(archive).catch(() => null)
    if (!bytes) {
      const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${cloudflared.version}/cloudflared-darwin-${name}.tgz`)
      if (!response.ok) throw new Error(`Could not download cloudflared for ${arch}: HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
    }
    await writeFile(archive, bytes)
    execFileSync('tar', ['-xzf', archive, '-C', `${dir}/${name}`])
    const actual = createHash('sha256').update(await readFile(`${dir}/${name}/cloudflared`)).digest('hex')
    if (actual !== sha256) throw new Error(`cloudflared ${arch} checksum mismatch: ${actual}`)
    slices.push(`${dir}/${name}/cloudflared`)
  }
  execFileSync('lipo', ['-create', ...slices, '-output', `${dir}/cloudflared`])
  return `${dir}/cloudflared`
}
let running = false
try { execFileSync('pgrep', ['-f', `${bundle}/Contents/MacOS/Nextslide`], { stdio: 'ignore' }); running = true } catch {}
if (running) throw new Error('Quit the native Nextslide app before replacing its bundle.')
await rm(bundle, { recursive: true, force: true })
await mkdir(`${bundle}/Contents/MacOS`, { recursive: true })
await cp('build/resources', `${bundle}/Contents/Resources`, { recursive: true })
const archs = release ? ['--arch', 'arm64', '--arch', 'x86_64'] : []
if (release) execFileSync('swift', ['build', '-c', 'release', '--product', 'Nextslide', ...archs], { stdio: 'inherit' })
const bin = execFileSync('swift', ['build', '-c', process.argv.includes('--debug') ? 'debug' : 'release', ...archs, '--show-bin-path'], { encoding: 'utf8' }).trim()
const executable = `${bundle}/Contents/MacOS/Nextslide`
await cp(`${bin}/Nextslide`, executable)
await mkdir(`${bundle}/Contents/Frameworks`, { recursive: true })
// ditto keeps the framework's symlinks, which codesign requires.
execFileSync('ditto', [`${sparkleArtifacts}/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework`, `${bundle}/Contents/Frameworks/Sparkle.framework`])
execFileSync('install_name_tool', ['-add_rpath', '@executable_path/../Frameworks', executable])
if (release) {
  await cp(await universalCloudflared(), `${bundle}/Contents/Resources/cloudflared`)
  // macOS 14 and 15 do not include this Swift runtime library, so the app must carry its own copy.
  const developer = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim()
  const toolchain = `${developer}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2/macosx`
  await cp(`${toolchain}/libswiftCompatibilitySpan.dylib`, `${bundle}/Contents/Frameworks/libswiftCompatibilitySpan.dylib`)
  execFileSync('install_name_tool', ['-delete_rpath', toolchain, executable])
}
await writeFile(`${bundle}/Contents/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.nextslide.desktop</string>
<key>CFBundleName</key><string>Nextslide</string>
<key>CFBundleDisplayName</key><string>Nextslide</string>
<key>CFBundleExecutable</key><string>Nextslide</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>Nextslide contributors</string>${release ? `
<key>SUFeedURL</key><string>${feedUrl}</string>
<key>SUPublicEDKey</key><string>${sparklePublicKey}</string>
<key>SUEnableAutomaticChecks</key><true/>` : ''}
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
  if (release) execFileSync('codesign', [...flags, `${bundle}/Contents/Frameworks/libswiftCompatibilitySpan.dylib`], { stdio: 'inherit' })
  // Sparkle's helpers need signing inside out, ending with the framework that contains them.
  const sparkle = `${bundle}/Contents/Frameworks/Sparkle.framework`
  for (const part of ['XPCServices/Installer.xpc', 'XPCServices/Downloader.xpc', 'Autoupdate', 'Updater.app']) {
    execFileSync('codesign', [...flags, ...(part.endsWith('Downloader.xpc') ? ['--preserve-metadata=entitlements'] : []), `${sparkle}/Versions/B/${part}`], { stdio: 'inherit' })
  }
  execFileSync('codesign', [...flags, sparkle], { stdio: 'inherit' })
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
  if (!hasProfile && release) throw new Error(`Refusing to produce an unnotarized release: no notarytool keychain profile "${profile}". Create one with:\n  xcrun notarytool store-credentials ${profile} --apple-id <apple-id> --team-id <team-id>`)
  if (hasProfile) {
    execFileSync('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', profile, '--wait'], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'staple', bundle], { stdio: 'inherit' })
    await rm(archive, { force: true })
    execFileSync('ditto', ['-c', '-k', '--keepParent', bundle, archive], { stdio: 'inherit' })
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'validate', bundle], { stdio: 'inherit' })
    // The disk image is what people download; the zip stays because Sparkle installs from it.
    const image = resolve('build/Nextslide.dmg')
    const staging = resolve('build/dmg')
    await rm(image, { force: true })
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    execFileSync('ditto', [bundle, `${staging}/Nextslide.app`])
    await symlink('/Applications', `${staging}/Applications`)
    execFileSync('hdiutil', ['create', '-volname', 'Nextslide', '-srcfolder', staging, '-fs', 'HFS+', '-format', 'UDZO', '-ov', image], { stdio: 'inherit' })
    await rm(staging, { recursive: true, force: true })
    execFileSync('codesign', ['--force', '--sign', signing.identity, '--timestamp', image], { stdio: 'inherit' })
    execFileSync('xcrun', ['notarytool', 'submit', image, '--keychain-profile', profile, '--wait'], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'staple', image], { stdio: 'inherit' })
    execFileSync('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', image], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'validate', image], { stdio: 'inherit' })
    // Sparkle verifies this signature against SUPublicEDKey, so it must cover the final stapled zip.
    const signature = execFileSync(`${sparkleArtifacts}/bin/sign_update`, ['--account', sparkleAccount, archive], { encoding: 'utf8' }).trim()
    await writeFile(resolve('../web/public/appcast.xml'), `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<title>Nextslide</title>
<link>${feedUrl}</link>
<item>
<title>Nextslide ${version}</title>
<pubDate>${new Date().toUTCString()}</pubDate>
<sparkle:version>${version}</sparkle:version>
<sparkle:shortVersionString>${version}</sparkle:shortVersionString>
<sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
<enclosure url="https://github.com/timmywheels/nextslide/releases/download/v${version}/Nextslide-${version}.zip" type="application/octet-stream" ${signature}/>
</item>
</channel>
</rss>
`)
    console.log(`Notarized and stapled: ${image} and ${archive}\nUpload both as v${version} on GitHub before deploying the updated apps/web/public/appcast.xml.`)
  } else {
    console.log(`Not notarized: no notarytool keychain profile "${profile}". Create one with:\n  xcrun notarytool store-credentials ${profile} --apple-id <apple-id> --team-id <team-id>\nthen rerun. Unnotarized archive: ${archive}`)
  }
}
