import { test, expect } from '@playwright/test'

// The admin sales orders table and drawer - the buy side's counterpart to
// admin-purchase-orders.e2e.ts, and like it: READ AND NAVIGATE, DO NOT
// MUTATE. These are real dev orders; the mutations are covered at the API
// level inside rolled-back transactions.
test.describe('the admin sales orders table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin?tab=sales-orders')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 })
  })

  test('every visible row names its customer', async ({ page }) => {
    // The regression this pins: the list wire carries user_id and no joined
    // user, and the User column rendered empty for weeks because it still read
    // the old composed shape. Fixed 2026-08-31 by matching ids against the
    // admin users list - this is the assertion that notices it breaking back.
    const rows = page.locator('tbody tr')
    const count = Math.min(await rows.count(), 5)
    expect(count, 'the sales orders table has no rows to check').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText()
      // A row is "SO - 000123 <name> <status...> <date>"; a missing name
      // collapses the row to number + date. Requiring a letter sequence
      // outside the SO prefix is the cheapest shape a human name has.
      expect(
        text.replace(/SO\s*-\s*\d+/, '').trim(),
        `sales order row ${i} names no customer`
      ).toMatch(/[A-Za-z]{2,}/)
    }
  })

  test('a row opens its drawer, named and numbered', async ({ page }) => {
    await page.locator('tbody tr').first().click()
    const drawer = page.getByRole('dialog', { name: /Sales order/i }).first()
    await expect(drawer).toBeVisible({ timeout: 20_000 })

    const text = await drawer.innerText()
    expect(text, 'the drawer does not show a sales order number').toMatch(/SO\s*-\s*\d+/)
    expect(text.length, 'the drawer rendered almost nothing').toBeGreaterThan(80)
  })
})
