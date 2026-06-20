// Logs in each seeded role via the real CSRF + session login API and saves a
// reusable storageState. Specs then start already authenticated, which is fast
// and avoids re-driving the login form on every test.
import { test as setup, expect } from '@playwright/test'
import { ACCOUNTS, storageStateFor } from './helpers/constants.js'

async function login(page, { username, password }) {
  // 1) Prime the CSRF cookie (mirrors frontend api.js behaviour).
  const csrfResp = await page.request.get('/api/auth/csrf')
  expect(csrfResp.ok()).toBeTruthy()

  const cookies = await page.context().cookies()
  const csrftoken = cookies.find((c) => c.name === 'csrftoken')?.value
  expect(csrftoken, 'csrftoken cookie should be set').toBeTruthy()

  // 2) Authenticate; the session cookie lands in this context.
  const loginResp = await page.request.post('/api/auth/login', {
    headers: { 'X-CSRFToken': csrftoken, 'Content-Type': 'application/json' },
    data: { username, password },
  })
  expect(loginResp.ok(), `login failed for ${username}`).toBeTruthy()
}

for (const [role, creds] of Object.entries(ACCOUNTS)) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await page.goto('/') // establish origin for cookies
    await login(page, creds)
    await page.context().storageState({ path: storageStateFor(role) })
  })
}
