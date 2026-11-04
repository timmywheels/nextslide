import { build } from 'esbuild'
import { mkdir, cp, copyFile, chmod, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
await mkdir('build/resources/engine', { recursive: true })
await rm('build/resources/tray.png', { force: true })
execFileSync('pnpm', ['--filter', '@nextslide/connection', 'build'], { stdio: 'inherit' })
execFileSync('swift', ['scripts/Icon.swift', 'build/icon.png'], { stdio: 'inherit' })
for (const size of [16, 48, 128, 180]) execFileSync('sips', ['-z', String(size), String(size), 'build/icon.png', '--out', `../web/public/icons/favicon-${size}.png`], { stdio: 'ignore' })
execFileSync('pnpm', ['--filter', '@nextslide/web', 'build'], { stdio: 'inherit' })
await rm('build/resources/remote', { recursive: true, force: true })
await cp('../web/dist', 'build/resources/remote', { recursive: true })
await copyFile('engine/index.html', 'build/resources/engine/index.html')
await build({ entryPoints: ['engine/host.ts'], bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', outfile: 'build/resources/engine/host.js', minify: true })
await build({ entryPoints: ['../desktop/src/presentation-control.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'NextslidePresentation', target: 'chrome120', outfile: 'build/resources/presentation.js', minify: true })
let cloudflared
try { cloudflared = execFileSync('/usr/bin/which', ['cloudflared'], { encoding: 'utf8' }).trim() }
catch { throw new Error('Install the build dependency with brew install cloudflared, then rebuild.') }
await copyFile(cloudflared, 'build/resources/cloudflared')
await chmod('build/resources/cloudflared', 0o755)
await mkdir('build/AppIcon.iconset', { recursive: true })
for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
  execFileSync('sips', ['-z', String(size * scale), String(size * scale), 'build/icon.png', '--out', `build/AppIcon.iconset/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`], { stdio: 'ignore' })
}
execFileSync('iconutil', ['-c', 'icns', 'build/AppIcon.iconset', '-o', 'build/resources/AppIcon.icns'], { stdio: 'inherit' })
