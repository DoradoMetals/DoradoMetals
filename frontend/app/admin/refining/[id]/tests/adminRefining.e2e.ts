import { test, expect } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

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
  expect(refiners.ok(), `GET /suppliers/get_all answered ${refiners.status()}`).toBeTruthy()
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

test('a refiner draft renders with the refiner select and Send to Refiner', async ({ page }) => {
  await page.goto(`/admin/refining/${refiningOrderId}`)

  await expect(page.getByText('SALES ORDER')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Refiner' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to Refiner' })).toBeVisible()
  await expect(page.getByText(/^SO-\d+$/)).toBeVisible()
})

test('a draft has no Finalize - sending is what a refiner order does instead', async ({ page }) => {
  await page.goto(`/admin/refining/${refiningOrderId}`)

  await expect(page.getByRole('button', { name: 'Finalize' })).toHaveCount(0)
})

test('a draft with no lots refuses to be sent', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ storageState: statePath('admin') })
  const view = await api.get(`${API}/refining/orders/${refiningOrderId}`)
  const { lots } = (await view.json()) as { lots: unknown[] }
  await api.dispose()
  test.skip(lots.length > 0, 'the open draft already carries lots, so Send is allowed')

  await page.goto(`/admin/refining/${refiningOrderId}`)
  await expect(page.getByRole('button', { name: 'Send to Refiner' })).toBeDisabled()
})

test('the aside carries Totals and Documents', async ({ page }) => {
  await page.goto(`/admin/refining/${refiningOrderId}`)

  await expect(page.getByRole('button', { name: /^Totals/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Documents/ })).toBeVisible()
})

test('the screen refuses a signed-out visitor', async ({ browser }) => {
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await anonymous.newPage()
  await page.goto(`/admin/refining/${refiningOrderId}`)
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await anonymous.close()
})
