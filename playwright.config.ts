import { defineConfig, devices } from '@playwright/test'

// End-to-End-Tests: Produktions-Build (mit Content Security Policy) gegen eine lokale Supabase
// (`supabase start`). Die Demo-Challenge spielt e2e/global-setup.ts ein.
const PORT = 4173
const BASE = '/SoullinkWebsite/'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Die Tests bauen aufeinander auf (Einladungslinks sind einmal nutzbar)
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    locale: 'de-DE',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Lokal (Cloud-Container) liegt Chromium vorinstalliert hier; in CI installiert Playwright ihn selbst
        launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_BASE: BASE },
  },
})
