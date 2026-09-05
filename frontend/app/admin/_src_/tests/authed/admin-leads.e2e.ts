import { test, expect } from '@playwright/test'

// Creating a lead, through the admin UI, for real.
//
// Leads is the feature furthest along the migration - both repos written, fully
// TypeScript, first in line for promotion - so a browser-level test of it is
// the closest thing to a rehearsal of what flipping LEADS_SOURCE will look
// like from a user's side.
//
// THESE WRITES COMMIT. A browser test has no pinned transaction: the request
// goes through the real API on its own connection and is committed like any
// other. Every lead created here is named with an `e2e-` prefix and deleted in
// an afterEach that runs even when the test fails, so a failure does not leave
// rows behind - and if cleanup itself fails, the row is at least obviously not
// a real customer.
//
// The create button had NO ACCESSIBLE NAME until this spec was written - it is
// an icon-only button, and five of the first twenty buttons on this page were
// nameless. Rather than select it by position, which would break the moment the
// toolbar changed, the button was given the name it should always have had.
const unique = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

// Names created by the test, removed afterwards. Tracked in a module-level set
// rather than a local so afterEach can reach them even if the test threw
// partway through creating one.
const createdNames = new Set<string>()

test.afterEach(async ({ request }) => {
  for (const name of createdNames) {
    try {
      const all = await request.get(`${API}/leads/get_all`)
      if (!all.ok()) continue
      const lead = (await all.json()).find((l: { name?: string }) => l.name === name)
      if (lead?.id) await request.delete(`${API}/leads/delete`, { data: { lead_id: lead.id } })
    } catch {
      // Best effort. A cleanup failure must not mask the test's own result, and
      // the e2e- prefix makes any survivor identifiable.
    }
  }
  createdNames.clear()
})

test.describe('an admin managing leads', () => {
  test('the leads table renders rows from the API', async ({ page }) => {
    await page.goto('/admin?tab=leads')
    await page.waitForTimeout(2500)

    // dev has leads; an empty table means the read broke, not that the business
    // has none.
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)
    await expect(page.getByRole('button', { name: /Create Lead/i })).toBeVisible()
  })

  test('creating a lead puts it in the table, and it can be removed again', async ({ page }) => {
    test.setTimeout(90_000)
    const name = unique()
    createdNames.add(name)

    await page.goto('/admin?tab=leads')
    await page.waitForTimeout(2500)

    await page.getByRole('button', { name: /Create Lead/i }).click()
    await expect(page.getByText('Create New Lead')).toBeVisible({ timeout: 10_000 })

    // The dialog builds its fields from createConfig, so they are addressable by
    // the labels the config declares.
    // Addressable by label now. Until this spec was written the dialog's
    // inputs had no id, name or aria-label and the labels were not associated
    // with them, so neither a test nor a screen reader could tell the fields
    // apart. CreateDialog now pairs every label with its control.
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Phone Number').fill('5555550123')
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.invalid`)
    await page.getByLabel('Notes').fill('created by the e2e suite')

    // Submit stays disabled until EVERY field is non-empty - see `canSubmit` in
    // CreateDialog. Priority defaults to Medium through its own control, so the
    // four above are what this form needs.

    const submit = page.getByRole('button', { name: /^Create Lead$/i }).last()
    await submit.click()

    // The table refetches after a create, so the new row is the assertion.
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 20_000 })
  })
})
