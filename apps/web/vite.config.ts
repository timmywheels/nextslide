import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5757,
    host: true,
    proxy: {
      '/api': 'http://localhost:4545',
      '/ws': {
        target: 'ws://localhost:4545',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
