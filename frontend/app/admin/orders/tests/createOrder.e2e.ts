import { expect, test, type Page, type Response } from '@playwright/test'

import { ROLES, statePath } from '@/shared/tests/roles'

test.use({ storageState: statePath('admin') })

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

const SIZES = [
  { name: 'desktop', width: 1440, height: 1386 },
  { name: 'mobile', width: 390, height: 844 },
]

type Json = Record<string, unknown>

async function api<T>(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const response = await page.request.fetch(`${API}${url}`, {
    method,
    ...(data !== undefined ? { data, headers: { 'Content-Type': 'application/json' } } : {}),
  })
  const text = await response.text()
  return { status: response.status(), body: (text ? JSON.parse(text) : null) as T }
}

const isCall = (method: string, path: RegExp) => (response: Response) =>
  response.request().method() === method && path.test(new URL(response.url()).pathname)

async function e2eCustomer(page: Page): Promise<{ id: string; name: string }> {
  const { status, body } = await api<{ id: string; name: string; email: string }[]>(
    page,
    'GET',
    '/users'
  )
  expect(status, 'GET /users').toBe(200)
  const customer = body.find((user) => user.email === ROLES.customer.email)
  expect(customer, 'the e2e seed has no customer; run pnpm seed').toBeTruthy()
  return customer!
}

async function goldProduct(page: Page): Promise<{ id: string; name: string }> {
  const { body } = await api<{ id: string; name: string; metal_id: string }[]>(
    page,
    'GET',
    '/products/admin'
  )
  const product = body.find((p) => p.metal_id === 'Gold') ?? body[0]
  expect(product, 'the catalogue holds no product').toBeTruthy()
  return product!
}

async function openDrawer(page: Page) {
  await page.goto('/admin/orders')
  await page.getByRole('button', { name: 'New order' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('heading', { name: 'New order' })).toBeVisible({ timeout: 30_000 })
  return drawer
}

async function chooseCustomer(page: Page, name: string) {
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('combobox', { name: 'Customer' }).fill(name.slice(0, 6))
  await page
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click()
}

async function chooseFirst(page: Page, label: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: label }).click()
  await page.getByRole('option').first().click()
}

async function cancelOrder(page: Page, id: string) {
  await api(page, 'POST', `/orders/${id}/cancel`, { reason: 'e2e create-order cleanup' })
}

for (const size of SIZES) {
  test.describe(`the Create Order drawer at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('a customer purchase with a bullion lot, a pickup and a Plaid-linked payout', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const customer = await e2eCustomer(page)
      const product = await goldProduct(page)
      const drawer = await openDrawer(page)

      if (size.name === 'mobile')
        await expect(drawer.getByText('Step 1 of 4 · Order')).toBeVisible()
      await expect(drawer.getByRole('radio', { name: /Customer Purchase/ })).toBeChecked()
      await chooseCustomer(page, customer.name)

      const previewed = page.waitForResponse(isCall('POST', /\/pricing\/preview$/))
      await drawer.getByRole('button', { name: /Add lot/ }).click()
      await drawer.getByRole('radio', { name: 'Bullion' }).first().click()
      await drawer.getByRole('combobox', { name: 'Product' }).fill(product.name.slice(0, 8))
      await page.getByRole('option', { name: product.name }).first().click()
      await drawer.getByRole('textbox', { name: 'Quantity' }).fill('1')
      const preview = (await (await previewed).json()) as { total: number; lines: Json[] }
      await expect(drawer.getByText(/Order estimate · 1 lot/)).toBeVisible()
      expect(preview.lines.length).toBeGreaterThanOrEqual(0)
      await expect(drawer.getByRole('textbox', { name: 'Premium (% of spot)' })).not.toHaveValue('')

      await drawer.getByRole('button', { name: 'Continue' }).click()
      await expect(drawer.getByText('How does the metal come in?')).toBeVisible()
      await expect(drawer.getByRole('radio', { name: /Decide later/ })).toBeDisabled()
      await drawer.getByRole('radio', { name: /Dorado pickup/ }).click()
      await chooseFirst(page, 'Pickup address')
      await chooseFirst(page, 'Bring to')
      await drawer
        .getByRole('grid')
        .getByRole('gridcell')
        .filter({ hasNotText: /^$/ })
        .last()
        .click()
      await chooseFirst(page, 'Window')
      await drawer.getByRole('button', { name: 'Continue' }).click()

      await expect(drawer.getByText('How do we pay them?')).toBeVisible()
      await drawer.getByRole('radio', { name: /ACH/ }).click()
      const payoutTo = drawer.getByRole('combobox', { name: 'Payout to' })
      if (await payoutTo.isVisible()) {
        await payoutTo.click()
        await page.getByRole('option', { name: 'Link a new account' }).click()
      }
      await expect(drawer.getByText('No linked bank account')).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Continue' })).toBeDisabled()
      const sent = page.waitForResponse(isCall('POST', /\/accounts\/[^/]+\/bank-links$/))
      await drawer.getByRole('radio', { name: 'Email' }).click()
      await drawer.getByRole('button', { name: 'Send link' }).click()
      const link = (await (await sent).json()) as { id: string; status: string }
      expect(link.status).toBe('pending')
      await expect(drawer.getByText('Pending')).toBeVisible()

      const completed = await api(page, 'POST', '/webhooks/plaid/fake', { link_id: link.id })
      expect(completed.status, 'the fake Plaid webhook').toBe(200)
      await expect(drawer.getByText('Verified')).toBeVisible({ timeout: 30_000 })
      await expect(drawer.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await drawer.getByRole('button', { name: 'Continue' }).click()

      await expect(drawer.getByRole('heading', { name: 'Review' })).toBeVisible()
      await expect(drawer.getByText('Payout total')).toBeVisible()
      await expect(drawer.getByText(customer.name)).toBeVisible()
      const created = page.waitForResponse(isCall('POST', /\/orders\/admin$/))
      await drawer.getByRole('button', { name: 'Create order' }).click()
      const response = await created
      expect(response.status()).toBe(201)
      const sentBody = response.request().postDataJSON() as Json
      expect(sentBody.direction).toBe('purchase')
      expect(sentBody.user_id).toBe(customer.id)
      expect(JSON.stringify(sentBody)).not.toMatch(/routing|account_number|price|total/)
      const order = ((await response.json()) as { order: { id: string } }).order
      await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}$`), { timeout: 30_000 })
      await cancelOrder(page, order.id)
    })
  })
}

test.describe('the Create Order drawer for a customer sale', () => {
  test.use({ viewport: { width: 1440, height: 1386 } })

  test('a bullion sale shipped to the customer, paid by a sale payment method', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const customer = await e2eCustomer(page)
    const product = await goldProduct(page)
    const drawer = await openDrawer(page)

    await drawer.getByRole('radio', { name: /Customer Sale/ }).click()
    await chooseCustomer(page, customer.name)
    await drawer.getByRole('button', { name: /Add lot/ }).click()
    await drawer.getByRole('combobox', { name: 'Product' }).fill(product.name.slice(0, 8))
    await page.getByRole('option', { name: product.name }).first().click()
    await drawer.getByRole('textbox', { name: 'Quantity' }).fill('1')
    await expect(drawer.getByText(/Order estimate · 1 lot/)).toBeVisible()
    await drawer.getByRole('button', { name: 'Continue' }).click()

    await expect(drawer.getByText('How does the metal go out?')).toBeVisible()
    await drawer.getByRole('radio', { name: /Shipment/ }).click()
    await chooseFirst(page, 'Service')
    await chooseFirst(page, 'Ship to')
    await drawer.getByRole('button', { name: 'Continue' }).click()

    await chooseFirst(page, 'Payment method')
    await chooseFirst(page, 'Billing address')
    await drawer.getByRole('button', { name: 'Continue' }).click()

    await expect(drawer.getByText('Charge total')).toBeVisible()
    await expect(drawer.getByText('Lock at placement')).toBeVisible()
    const created = page.waitForResponse(isCall('POST', /\/orders\/admin$/))
    await drawer.getByRole('button', { name: 'Create order' }).click()
    const response = await created
    if (response.status() !== 201) {
      await expect(drawer.getByRole('alert')).toContainText('Could not create the order')
      return
    }
    expect((response.request().postDataJSON() as Json).direction).toBe('sale')
    const order = ((await response.json()) as { order: { id: string } }).order
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}$`), { timeout: 30_000 })
    await cancelOrder(page, order.id)
  })
})

test.describe('the Create Order drawer for a Refiner Sale', () => {
  test.use({ viewport: { width: 1440, height: 1386 } })

  test('selects on-hand lots, drops off at the refinery and creates the refiner order', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const refiners = await api<{ id: string; organization: { name: string } }[]>(
      page,
      'GET',
      '/suppliers/get_all'
    )
    const open = await api<{
      items: { refiner_id: string; sent_at: string | null; cancelled_at: string | null }[]
    }>(page, 'GET', '/refining/orders?direction=sell&limit=200')
    const busy = new Set(
      open.body.items.filter((o) => !o.sent_at && !o.cancelled_at).map((o) => o.refiner_id)
    )
    const free = refiners.body.find((r) => !busy.has(r.id))
    const drawer = await openDrawer(page)
    await drawer.getByRole('radio', { name: /Refiner Sale/ }).click()

    if (!free) {
      await chooseFirst(page, 'Refiner')
      await expect(drawer.getByText(/already has an open sell order/)).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Continue' })).toBeDisabled()
      return
    }

    await drawer.getByRole('combobox', { name: 'Refiner' }).click()
    await page.getByRole('option', { name: free.organization.name }).click()
    await chooseFirst(page, 'Settlement type')
    await chooseFirst(page, 'Location')
    await expect(drawer.getByText('On-hand lots')).toBeVisible({ timeout: 30_000 })
    const boxes = drawer.getByRole('checkbox')
    const selectable = (await boxes.count()) > 1
    if (selectable) {
      await boxes.nth(1).check()
      await expect(drawer.getByText(/1 selected/)).toBeVisible()
    }
    await drawer.getByRole('button', { name: 'Continue' }).click()

    await expect(drawer.getByText('How do the lots reach the refiner?')).toBeVisible()
    if (selectable) {
      await drawer.getByRole('radio', { name: /Drop-off/ }).click()
      await chooseFirst(page, 'Driver')
      await chooseFirst(page, 'From')
      await drawer
        .getByRole('grid')
        .getByRole('gridcell')
        .filter({ hasNotText: /^$/ })
        .last()
        .click()
      await chooseFirst(page, 'Window')
    } else {
      await drawer.getByRole('radio', { name: /Decide later/ }).click()
    }
    await drawer.getByRole('button', { name: 'Continue' }).click()
    await expect(drawer.getByText('Settlement comes later')).toBeVisible()
    await drawer.getByRole('button', { name: 'Continue' }).click()

    await expect(drawer.getByText(free.organization.name)).toBeVisible()
    const created = page.waitForResponse(isCall('POST', /\/refining\/orders$/))
    await drawer.getByRole('button', { name: 'Create order' }).click()
    const response = await created
    expect(response.status()).toBe(201)
    const body = response.request().postDataJSON() as Json
    expect(body.direction).toBe('sell')
    expect(body.refiner_id).toBe(free.id)
    const order = (await response.json()) as { id: string }
    await expect(page).toHaveURL(new RegExp(`/admin/orders/refiners/${order.id}$`), {
      timeout: 30_000,
    })
    await api(page, 'POST', `/refining/orders/${order.id}/cancel`, {})
  })
})
