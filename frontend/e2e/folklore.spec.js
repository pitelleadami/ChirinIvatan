// Folklore workflows: contributor submits a folklore entry, and two reviewers
// approve the seeded pending folklore entry to meet the quorum of two.
// Desktop-only (reviewer modal flow); the contributor submit also covers the
// RichTextEditor content field.
import { test, expect } from '@playwright/test'
import { ROUTES, storageStateFor, PENDING_FOLKLORE_TITLE } from './helpers/constants.js'

test.describe('contributor (folklore)', () => {
  test.use({ storageState: storageStateFor('contributor') })

  test('submits a new folklore entry for review', async ({ page }) => {
    const title = `e2e_folklore_${Date.now()}`

    await page.goto(ROUTES.folkloreView)
    await page.getByRole('button', { name: /add folklore entry/i }).click()
    await expect(page.getByRole('heading', { name: /Folklore Draft Builder/i })).toBeVisible()

    await page.locator('#folklore-title').fill(title)
    // Content is a TipTap rich-text editor (contenteditable .ProseMirror).
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('An automated end-to-end folklore submission.')

    // Category/subcategory default to oral_narratives/myths — leave as-is.
    // Source question: answer "Yes" (own knowledge) to satisfy the source rule.
    const sourceFieldset = page.locator('fieldset', { hasText: /own knowledge/i })
    await sourceFieldset.getByRole('radio').first().check()

    await page.getByRole('button', { name: /^Submit Draft$/ }).click()
    await expect(page.getByText(/Submitted for review/i).first()).toBeVisible({ timeout: 10_000 })
  })
})

// One reviewer opens the folklore queue card for PENDING_FOLKLORE_TITLE and approves.
async function approveFolkloreAs(browser, role) {
  const context = await browser.newContext({ storageState: storageStateFor(role) })
  const page = await context.newPage()
  try {
    await page.goto(ROUTES.reviewerDashboard)
    await page.getByRole('button', { name: /^Reviews$/ }).click()

    const card = page.locator('.queue-card', { hasText: PENDING_FOLKLORE_TITLE })
    await expect(card.first()).toBeVisible({ timeout: 10_000 })
    await card
      .first()
      .getByRole('button', { name: /^Review$/ })
      .click()

    const approve = page.getByRole('button', { name: /^Approve$/ })
    await expect(approve).toBeVisible()
    await approve.click()

    await expect(
      page
        .getByRole('status')
        .or(page.getByText(/approv/i))
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    })
  } finally {
    await context.close()
  }
}

test('two reviewers reach quorum and publish the folklore entry', async ({ browser }) => {
  await approveFolkloreAs(browser, 'reviewer1')
  await approveFolkloreAs(browser, 'reviewer2')

  // Verify publication via the public folklore API from a fresh session.
  const visitorContext = await browser.newContext()
  const page = await visitorContext.newPage()
  try {
    const resp = await page.request.get('/api/folklore/entries')
    expect(resp.ok()).toBeTruthy()
    const body = await resp.text()
    expect(body).toContain(PENDING_FOLKLORE_TITLE)
  } finally {
    await visitorContext.close()
  }
})
