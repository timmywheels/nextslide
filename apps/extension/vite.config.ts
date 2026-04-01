import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
  plugins: [
    react(),
    tailwindcss(),
    // Inject the deterministic extension key into dist/manifest.json for dev
    // builds only. Production builds stay clean so the CWS accepts the zip.
    ...(env['VITE_MANIFEST_KEY'] ? [{
      name: 'inject-manifest-key',
      closeBundle() {
        const path = resolve(__dirname, 'dist/manifest.json')
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
        manifest['key'] = env['VITE_MANIFEST_KEY']
        writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
      },
    }] : []),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Chrome extensions cannot use code-splitting — bundle each entry independently
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        manager: resolve(__dirname, 'manager.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        options: resolve(__dirname, 'options.html'),
      },
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
