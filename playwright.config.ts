import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', timeout: 30000, workers: 1,
  use: {
    channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure',
    // Isolated headless Chrome contexts cannot resolve each other's mDNS ICE
    // hostnames here. Use explicit local candidates only in this test browser.
    launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] },
  },
  webServer: [
    { command: 'node apps/server/dist/index.js', env: { PORT: '4654', HOST: '127.0.0.1', LOG_LEVEL: 'silent' }, url: 'http://127.0.0.1:4654/health', reuseExistingServer: false },
    { command: 'pnpm --filter @nextslide/desktop exec vite preview --host 127.0.0.1 --port 5657', url: 'http://127.0.0.1:5657', reuseExistingServer: false },
  ],
})
