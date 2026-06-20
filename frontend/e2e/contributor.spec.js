// Contributor workflow: a logged-in contributor submits a new dictionary entry
// for review through the real UI (Add entry -> fill form -> Submit Entry).
import { test, expect } from '@playwright/test'
import { ROUTES, storageStateFor } from './helpers/constants.js'

test.use({ storageState: storageStateFor('contributor') })

test('contributor submits a new dictionary entry for review', async ({ page }) => {
  const term = `e2e_ui_${Date.now()}`

  await page.goto(ROUTES.dictionaryView)
  // The "+" add button opens the draft builder.
  await page.getByRole('button', { name: /add dictionary entry/i }).click()
  await expect(page.getByRole('heading', { name: /Dictionary Draft Builder/i })).toBeVisible()

  await page.locator('#dictionary-term').fill(term)
  await page.locator('#dictionary-meaning').fill('An automated end-to-end UI submission.')
  // Part of speech is a <select>; choose the first real option.
  await page
    .locator('#dictionary-pos')
    .selectOption({ index: 1 })
    .catch(() => {})

  // Headword source question: answer "Yes" (own knowledge) to satisfy the
  // source requirement without free-text.
  const sourceFieldset = page.locator('fieldset', { hasText: /own knowledge/i })
  await sourceFieldset.getByRole('radio').first().check()

  await page.getByRole('button', { name: /^Submit Entry$/ }).click()

  // Success: the pending confirmation message appears.
  await expect(page.getByText(/Submitted for review/i).first()).toBeVisible({ timeout: 10_000 })
})
