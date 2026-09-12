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

// THE WRITES THE SECOND PASS WIRED. They live in this file rather than beside
// it because `seed:e2e:order` clears the previous e2e order as it mints the
// next: two spec files seeding in parallel workers raced on the same rows and
// failed on a foreign key. One seed, one file.

test('the composer sends a message and the conversation shows it back', async ({ page }) => {
  const body = `e2e ${Date.now()}`
  await page.goto(`/admin/orders/${orderId}`)

  const composer = page.getByPlaceholder('Text the customer…')
  await expect(composer).toBeVisible()
  await composer.fill(body)

  const sent = page.waitForResponse(
    (res) => res.url().endsWith('/api/sms') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  expect((await sent).status()).toBe(201)

  await expect(page.getByText(body)).toBeVisible()
})

test('an available document offers Send, and pressing it calls the send route', async ({
  page,
}) => {
  await page.goto(`/admin/orders/${orderId}`)

  const send = page.getByRole('button', { name: /^Send [A-Z]/ }).first()
  await expect(send).toBeVisible()

  const call = page.waitForRequest(
    (req) => /\/documents\/[a-z_]+\/send$/.test(req.url()) && req.method() === 'POST'
  )
  await send.click()
  expect((await call).url()).toMatch(/\/orders\/[0-9a-f-]+\/documents\/[a-z_]+\/send$/)
})

test('an unavailable document offers Import, which is a multipart POST', async ({ page }) => {
  await page.goto(`/admin/orders/${orderId}`)

  const importRow = page.getByRole('button', { name: /^Import / }).first()
  const count = await importRow.count()
  test.skip(count === 0, 'every document on this order is available, so nothing offers Import')

  await importRow.click()
  const call = page.waitForRequest(
    (req) => /\/documents\/[a-z_]+$/.test(req.url()) && req.method() === 'POST'
  )
  await page.locator('[data-testid="document-import"]').setInputFiles({
    name: 'imported.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%e2e\n'),
  })
  const request = await call
  expect(request.headers()['content-type'] ?? '').toContain('multipart/form-data')
})

// BATCH IS ONE CALL NOW (GAP 8). It used to be a create followed by an assign
// with nothing between them, so this asserts the lot ids ride with the create.
test('Batch creates the refiner order and assigns the lots in one call', async ({
  page,
  playwright,
}) => {
  const api = await playwright.request.newContext({ storageState: statePath('admin') })
  const [refiners, open] = await Promise.all([
    api.get(`${API}/suppliers/get_all`),
    api.get(`${API}/refining/orders`),
  ])
  const all = (await refiners.json()) as { id: string; organization: { name: string | null } }[]
  const busy = new Set(
    ((await open.json()) as { refiner_id: string; direction: string; sent_at: string | null }[])
      .filter((one) => one.direction === 'sell' && one.sent_at === null)
      .map((one) => one.refiner_id)
  )
  await api.dispose()

  const free = all.find((one) => !busy.has(one.id) && one.organization.name)
  test.skip(!free, 'every refiner already holds an open sell order, so a batch would 409')

  await page.goto(`/admin/orders/${orderId}`)
  await page.getByLabel('Select all lots').check()

  await page.getByRole('combobox', { name: 'Refiner' }).click()
  await page.getByRole('option', { name: free!.organization.name! }).click()

  const created = page.waitForResponse(
    (res) => res.url().endsWith('/api/refining/orders') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Batch' }).click()

  const response = await created
  expect(response.status(), await response.text()).toBe(201)
  const body = response.request().postDataJSON() as { lot_ids?: string[] }
  expect(body.lot_ids?.length ?? 0).toBeGreaterThan(0)
})

// THE WAY IN. Before the nav lane there was none: `/admin/orders/<id>` was a
// URL you had to already know. These two drive the route Jacob asked for - the
// header's Admin link, and the index's table - and click through to the screen
// the tests above assert on.
test('an admin is offered the Admin link, and it lands on the index', async ({ page }) => {
  await page.goto('/')

  const admin = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
    name: 'Admin',
  })
  await expect(admin).toBeVisible()
  await admin.click()
  await expect(page).toHaveURL(/\/admin$/)
  // `exact` because "Refiner orders" also contains the word.
  await expect(page.getByRole('table', { name: 'Orders', exact: true })).toBeVisible()
})

test('the index lists the seeded order and clicks through to its screen', async ({
  page,
  playwright,
}) => {
  // WHICH CELL to look for is the API's answer, not a guess: the list route
  // serves the order NUMBER (there is no `reference` on it), so the row is
  // found by the number this very order carries.
  const api = await playwright.request.newContext({ storageState: statePath('admin') })
  const read = await api.get(`${API}/orders/${orderId}`)
  expect(read.ok(), `GET /orders/:id answered ${read.status()}`).toBeTruthy()
  const view = (await read.json()) as { order: { number: number } }
  await api.dispose()

  await page.goto('/admin')

  const table = page.getByRole('table', { name: 'Orders', exact: true })
  const link = table.getByRole('link', { name: String(view.order.number), exact: true })
  await expect(link).toBeVisible()

  await link.click()
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderId}$`))
  await expect(page.getByText('PURCHASE ORDER')).toBeVisible()
})

test('the admin index refuses a signed-out visitor', async ({ browser }) => {
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await anonymous.newPage()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await anonymous.close()
})
