// Reviewer workflow: two distinct reviewers approve the same pending submission
// to satisfy the quorum-of-two rule, after which the entry is published.
//
// Uses the seeded pending revision (PENDING_TERM). `manage.py seed_e2e_testdata`
// resets it to PENDING each run, so this is repeatable.
import { test, expect } from '@playwright/test'
import { ROUTES, storageStateFor, PENDING_TERM } from './helpers/constants.js'

// Single reviewer opens the queue card for PENDING_TERM and approves it.
async function approveAs(browser, role) {
  const context = await browser.newContext({ storageState: storageStateFor(role) })
  const page = await context.newPage()
  try {
    await page.goto(ROUTES.reviewerDashboard)
    await page.getByRole('button', { name: /^Reviews$/ }).click()

    const card = page.locator('.queue-card', { hasText: PENDING_TERM })
    await expect(card.first()).toBeVisible({ timeout: 10_000 })
    await card
      .first()
      .getByRole('button', { name: /^Review$/ })
      .click()

    const approve = page.getByRole('button', { name: /^Approve$/ })
    await expect(approve).toBeVisible()
    await approve.click()

    // Wait for the decision to register (toast / status update).
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

test('two reviewers reach quorum and the entry gets published', async ({ browser }) => {
  // First approval -> moves to "awaiting quorum".
  await approveAs(browser, 'reviewer1')
  // Second, distinct approval -> quorum met -> published.
  await approveAs(browser, 'reviewer2')

  // Verify publication from a fresh anonymous visitor session.
  const visitorContext = await browser.newContext()
  const page = await visitorContext.newPage()
  try {
    await page.goto(ROUTES.dictionaryView)
    await page.getByPlaceholder(/Search an Ivatan term/i).fill(PENDING_TERM)
    await page.getByRole('button', { name: /^Search$/ }).click()
    await expect(page.getByText(PENDING_TERM).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await visitorContext.close()
  }
})
