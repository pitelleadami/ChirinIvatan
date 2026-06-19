// Playwright config for the Chirin Ivatan E2E suite.
//
// SAFETY: baseURL is hard-locked to localhost. This suite is designed to run
// against the LOCAL dev stack only (Django runserver + Vite + local SQLite).
// Do not repoint baseURL at a live host without gating destructive specs.
import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = 'http://localhost:5173'
const PYTHON_BIN = process.env.E2E_PYTHON || process.env.PYTHON || 'python3'

// Cloudflare Turnstile sandbox keys (always-pass). Used so any widget on the
// page never blocks automation. Login itself does not require Turnstile.
const TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
const TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js', // (re)seeds local SQLite test data
  fullyParallel: false, // reviewer quorum + shared seed data => keep deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      // Desktop: full coverage (visitor, contributor, reviewer, folklore).
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      // Mobile: the flows real beta testers do on a phone — public browsing,
      // mobile nav, and the contributor submit. Heavier reviewer modal flows
      // stay desktop-only. Pixel 7 = mobile Chromium (no extra browser needed).
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /(visitor|mobile|contributor)\.spec\.js/,
      dependencies: ['setup'],
    },
  ],

  // Auto-start both servers. reuseExistingServer lets you keep your own
  // runserver/vite running while iterating.
  webServer: [
    {
      command:
        'TURNSTILE_SECRET_KEY=' +
        TURNSTILE_SECRET_KEY +
        ' DJANGO_DEBUG=True ' +
        PYTHON_BIN +
        ' manage.py runserver 8000',
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/api/auth/csrf',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_TURNSTILE_SITE_KEY: TURNSTILE_SITE_KEY },
    },
  ],
})
