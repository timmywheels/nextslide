import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', timeout: 30000, workers: 1,
  use: {
    channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure',
    // Isolated headless Chrome contexts cannot resolve each other's mDNS ICE
    // hostnames here. Use explicit local candidates only in this test browser.
    launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] },
  },
})
