import { test, expect } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

// A refiner order's handover, end to end: create the fulfillment against the
// refining order, choose the refinery and the date, and schedule the drop-off.
// The whole method was GAP 20 - no read, no patch arm, no route.
test.use({ storageState: statePath('admin') })

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

let refiningOrderId: string

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ storageState: statePath('admin') })

  const existing = await api.get(`${API}/refining/orders`)
  expect(existing.ok(), `GET /refining/orders answered ${existing.status()}`).toBeTruthy()
  const open = (
    (await existing.json()) as { id: string; direction: string; sent_at: string | null }[]
  ).find((one) => one.direction === 'sell' && one.sent_at === null)

  if (open) {
    refiningOrderId = open.id
    await api.dispose()
    return
  }

  const refiners = await api.get(`${API}/suppliers/get_all`)
  const list = (await refiners.json()) as { id: string }[]
  test.skip(list.length === 0, 'no refiner in the database to open an order with')

  const created = await api.post(`${API}/refining/orders`, {
    data: { refiner_id: list[0]!.id, direction: 'sell' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(created.ok(), `POST /refining/orders answered ${created.status()}`).toBeTruthy()
  refiningOrderId = ((await created.json()) as { id: string }).id
  await api.dispose()
})

test('Create fulfillment gives a refiner order its drop-off, and Schedule books it', async ({
  page,
}) => {
  await page.goto(`/admin/refining/${refiningOrderId}`)

  const made = page.waitForResponse(
    (res) => res.url().endsWith('/api/fulfillments') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Create fulfillment' }).click()
  const response = await made
  expect(response.status(), await response.text()).toBe(200)
  expect(((await response.json()) as { method: { category: string } }).method.category).toBe(
    'DROPOFF'
  )

  // A PREVIOUS RUN MAY HAVE BOOKED THIS ONE. The suite reuses the refiner's one
  // open sell order, so cancel the booking first and take the card back to its
  // choices - which is also the Cancel Drop-off path, driven for free.
  const cancel = page.getByRole('button', { name: 'Cancel Drop-off' })
  if (await cancel.isVisible().catch(() => false)) {
    const undone = page.waitForResponse(
      (res) =>
        res.url().endsWith('/api/fulfillments/cancel_schedule') && res.request().method() === 'POST'
    )
    await cancel.click()
    expect((await undone).status()).toBe(200)
  }

  await expect(page.getByRole('combobox', { name: 'Refinery' })).toBeVisible()
  await expect(page.getByText('Drop-off date', { exact: true })).toBeVisible()

  await page.getByRole('combobox', { name: 'Refinery' }).click()
  await page.getByRole('option').first().click()

  const days = page
    .getByRole('group', { name: 'Drop-off date' })
    .locator('button')
    .filter({ hasText: /^\d{1,2}$/ })
  const total = await days.count()
  let clicked = false
  for (let index = 0; index < total; index += 1) {
    const day = days.nth(index)
    if (await day.isEnabled()) {
      await day.click()
      clicked = true
      break
    }
  }
  expect(clicked, 'the drop-off calendar offered no selectable day').toBeTruthy()

  const booked = page.waitForResponse(
    (res) =>
      res.url().endsWith('/api/fulfillments/schedule_dropoff') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Schedule' }).click()
  const scheduled = await booked
  expect(scheduled.status(), await scheduled.text()).toBe(200)

  await expect(page.getByRole('button', { name: 'Headed to Refinery' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel Drop-off' })).toBeVisible()
})

test('the refiner Settlement statement is imported as multipart, never sent', async ({ page }) => {
  await page.goto(`/admin/refining/${refiningOrderId}`)

  await expect(page.getByRole('button', { name: /^Send [A-Z]/ })).toHaveCount(0)

  const importRow = page.getByRole('button', { name: /^Import / }).first()
  await expect(importRow).toBeVisible()
  await importRow.click()

  const call = page.waitForResponse(
    (res) => /\/documents\/[a-z_]+$/.test(res.url()) && res.request().method() === 'POST'
  )
  await page.locator('[data-testid="document-import"]').setInputFiles({
    name: 'settlement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%e2e settlement\n'),
  })
  const response = await call
  expect(response.status(), await response.text()).toBe(201)
  expect(response.request().headers()['content-type'] ?? '').toContain('multipart/form-data')
})
