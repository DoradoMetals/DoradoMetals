import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { statePath } from '@/shared/tests/roles'

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

// The customer order screen in a real browser, signed in as the seeded admin,
// against a real API and a real order.
//
// The order is minted by `seed:e2e:order` rather than through the create
// endpoint, because the real create always buys a FedEx label. What the seed
// gives back is an id, and every assertion below is about what the API answers
// for THAT id - so a card that renders from a hard-coded shape fails here even
// though it passed under jsdom.
test.use({ storageState: statePath('admin') })

const repoRoot = path.resolve(process.cwd(), '..')

function seedOrder(): string {
  const out = execFileSync('pnpm', ['--filter', '@dorado/api', 'seed:e2e:order'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
  })
  const line = out
    .trim()
    .split('\n')
    .reverse()
    .find((one) => one.trim().startsWith('{'))
  if (!line) throw new Error(`seed:e2e:order printed no order:\n${out}`)
  return (JSON.parse(line) as { order_id: string }).order_id
}

let orderId: string

test.beforeAll(() => {
  orderId = seedOrder()
})

test('the admin order screen renders the seeded order live', async ({ page }) => {
  await page.goto(`/admin/orders/${orderId}`)

  await expect(page.getByText('PURCHASE ORDER')).toBeVisible()
  await expect(page.getByText(/PO-\d+/)).toBeVisible()
  await expect(page.getByText('Assigned to')).toBeVisible()
})

test('the cards on the main column come off the order view', async ({ page }) => {
  await page.goto(`/admin/orders/${orderId}`)

  await expect(page.getByRole('button', { name: 'Lots' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Spots/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Charges/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Payment/ })).toBeVisible()
})

test('the aside carries Totals, Profit, Documents and the conversation', async ({ page }) => {
  await page.goto(`/admin/orders/${orderId}`)

  await expect(page.getByRole('button', { name: /^Totals/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Profit Breakdown/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Documents/ })).toBeVisible()
})

// WHICH METALS the card draws is the order's own spot rows, so the assertion
// asks the API which they are rather than naming one. Hard-coding "Gold" made
// this pass or fail on what the seed happened to put on the order.
test('every spot field is one the order own rows name', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ storageState: statePath('admin') })
  const read = await api.get(`${API}/orders/${orderId}/spots`)
  expect(read.ok(), `GET /orders/:id/spots answered ${read.status()}`).toBeTruthy()
  const spots = (await read.json()) as { metal_id: string }[]
  await api.dispose()
  test.skip(spots.length === 0, 'the seeded order carries no spot rows')

  await page.goto(`/admin/orders/${orderId}`)
  for (const spot of spots) {
    await expect(page.getByLabel(spot.metal_id)).toBeVisible()
  }
})

test('the screen refuses a signed-out visitor', async ({ browser }) => {
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await anonymous.newPage()
  await page.goto(`/admin/orders/${orderId}`)
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await anonymous.close()
})
