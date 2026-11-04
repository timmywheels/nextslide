import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { mkdir, cp, copyFile, chmod, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
await mkdir('dist', { recursive: true })
execFileSync('pnpm', ['--filter', '@nextslide/web', 'build'], { stdio: 'inherit' })
await rm('dist/remote', { recursive: true, force: true })
for (const old of ['chrome-extension', 'extension-id.json', 'browser-bridge']) await rm(`dist/${old}`, { recursive: true, force: true })
await cp('../web/dist', 'dist/remote', { recursive: true })
let cloudflared
try { cloudflared = execFileSync('/usr/bin/which', ['cloudflared'], { encoding: 'utf8' }).trim() }
catch { throw new Error('Install the tunnel build dependency with brew install cloudflared, then rebuild.') }
await copyFile(cloudflared, 'dist/cloudflared')
await chmod('dist/cloudflared', 0o755)
await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist/main.cjs', external: ['electron'] })
await build({ entryPoints: ['src/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist/preload.cjs', external: ['electron'] })
await viteBuild()
if (process.platform !== 'darwin') throw new Error('The macOS menu bar app must be built on macOS.')
const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64'
execFileSync('swiftc', ['-O', '-target', `${architecture}-apple-macos13.0`, 'native/SlideControl.swift', '-o', 'dist/slide-control'], { stdio: 'inherit' })
execFileSync('dist/slide-control', ['--icon', 'dist/tray.png'], { stdio: 'inherit' })
execFileSync('dist/slide-control', ['--app-icon', 'dist/app.png'], { stdio: 'inherit' })
await mkdir('dist/app.iconset', { recursive: true })
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    execFileSync('sips', ['-z', String(size * scale), String(size * scale), 'dist/app.png', '--out', `dist/app.iconset/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`], { stdio: 'ignore' })
  }
}
execFileSync('iconutil', ['-c', 'icns', 'dist/app.iconset', '-o', 'dist/app.icns'], { stdio: 'inherit' })
