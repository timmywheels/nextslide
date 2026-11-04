import { execFileSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bundle = join(root, 'apps/macos/build/Nextslide.app')
if (process.platform !== 'darwin') throw new Error('The menu bar app requires macOS.')
try { await access(join(bundle, 'Contents/MacOS/Nextslide')) }
catch { throw new Error('Build the app first: pnpm package:desktop') }
execFileSync('/usr/bin/open', [bundle], { stdio: 'inherit' })
console.log('Opened Nextslide. Use its menu bar icon to open a presentation and invite speakers.')
