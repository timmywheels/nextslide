import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const manifestKey = env['VITE_MANIFEST_KEY']
  const input: Record<string, string> = {
    popup: resolve(__dirname, 'popup.html'), manager: resolve(__dirname, 'manager.html'),
    background: resolve(__dirname, 'src/background.ts'), content: resolve(__dirname, 'src/content.ts'), options: resolve(__dirname, 'options.html'),
  }
  return {
  plugins: [
    react(),
    tailwindcss(),
    // Inject the deterministic extension key into dist/manifest.json for dev
    // builds only. Production builds stay clean so the CWS accepts the zip.
    ...(manifestKey ? [{
      name: 'inject-manifest-key',
      closeBundle() {
        const path = resolve(__dirname, 'dist/manifest.json')
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
        manifest['key'] = manifestKey
        writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
      },
    }] : []),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Chrome extensions cannot use code-splitting — bundle each entry independently
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name][extname]',
        // Flatten popup.html to dist root
        dir: 'dist',
      },
    },
  },
  // Copy public/ (manifest.json, icons) into dist
  publicDir: 'public',
  }
})
