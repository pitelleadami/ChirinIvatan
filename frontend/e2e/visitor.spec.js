// Visitor workflow: an unauthenticated public user browses the archive.
// No storageState => anonymous. Read-only; touches nothing.
// Written to pass identically on desktop and mobile viewports (it searches for
// a seeded entry instead of depending on browse-list order, and checks auth
// state via the API instead of the viewport-dependent nav).
import { test, expect } from '@playwright/test'
import { ROUTES, PUBLISHED_TERM, PUBLISHED_MEANING } from './helpers/constants.js'

test.describe('visitor (anonymous)', () => {
  test('can browse the public dictionary', async ({ page }) => {
    await page.goto(ROUTES.dictionaryView)
    await expect(page.getByRole('heading', { name: /Chirin Ivatan Dictionary/i })).toBeVisible()
    await expect(page.getByPlaceholder(/Search an Ivatan term/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: /Browse Dictionary Terms/i })).toBeVisible()
  })

  test('can search for and open a dictionary entry', async ({ page }) => {
    await page.goto(ROUTES.dictionaryView)
    await page.getByPlaceholder(/Search an Ivatan term/i).fill(PUBLISHED_TERM)
    await page.getByRole('button', { name: /^Search$/ }).click()

    const result = page.getByRole('button', { name: new RegExp(PUBLISHED_TERM, 'i') })
    await expect(result.first()).toBeVisible({ timeout: 10_000 })
    await result.first().click()

    await expect(page.getByText(new RegExp(PUBLISHED_MEANING, 'i'))).toBeVisible()
  })

  test('can browse public folklore', async ({ page }) => {
    await page.goto(ROUTES.folkloreView)
    await expect(page).toHaveURL(/folklore-view/)
    await expect(page.locator('body')).not.toContainText(/Log In to continue/i)
  })

  test('is not authenticated', async ({ page }) => {
    await page.goto(ROUTES.home)
    // Auth state is viewport-independent (nav collapses behind a menu on mobile).
    const me = await page.request.get('/api/auth/me')
    expect(me.ok()).toBeTruthy()
    expect((await me.json()).is_authenticated).toBeFalsy()
    // And there is no Log Out control anywhere on the page.
    await expect(page.getByRole('button', { name: /Log Out/i })).toHaveCount(0)
  })
})
