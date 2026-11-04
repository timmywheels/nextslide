import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
execFileSync('pnpm', ['exec', 'tsc', '--noEmit'], { stdio: 'inherit' })
execFileSync(process.execPath, ['scripts/resources.mjs'], { stdio: 'inherit' })
execFileSync('swift', ['build', '-c', 'release', '--product', 'Nextslide'], { stdio: 'inherit' })
