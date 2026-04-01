import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
})
