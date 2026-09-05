import { test, expect, request as pwRequest } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

// WORKING a purchase order in the admin drawer - the mutation coverage the
// read-only spec (admin-purchase-orders.e2e.ts) deliberately refuses, because
// it acts on real dev orders. This one acts on an order IT MINTS: the seed
// script writes the rows the way the live create does (both schemas, items,
// payout, shipment) with no FedEx call and no email, owned by the E2E
// customer.
//
// THE ORDER ENDS CANCELLED, ON PURPOSE. There is no API that deletes an order
// (that cascade is the unported purgeCancelled), so the disposable order's
// terminal state is Cancelled - legible, owned by the E2E account, and more
// fuel for porting the purge natively.
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')
let orderNumber = 0
let orderId = ''

test.beforeAll(() => {
  const out = execSync('pnpm --filter @dorado/api seed:e2e:order', {
    cwd: path.resolve(process.cwd(), '..'),
    encoding: 'utf8',
  })
  const line = out
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'))
  if (!line) throw new Error(`the seed printed no JSON. Output was:\n${out}`)
  const seeded = JSON.parse(line)
  orderNumber = seeded.number
  orderId = seeded.order_id
  expect(orderNumber, 'the seed returned no order number').toBeGreaterThan(0)
})

// UNCONDITIONAL. The in-test cancel only runs when every step before it
// passed; the first broken run of this spec leaked two In Transit orders into
// dev. This runs either way, through the same admin status write the drawer
// sends ('Cancelled' is a plain status label; the cancel OP with a
// return_shipment is the one that buys a FedEx label, and nothing here goes
// near it).
test.afterAll(async () => {
  if (!orderId) return
  const ctx = await pwRequest.newContext({ storageState: 'playwright/.auth/admin.json' })
  await ctx.patch(`${API}/orders/${orderId}`, { data: { status: 'Cancelled' } }).catch(() => {})
  await ctx.dispose()
})

test('a seeded order walks Received and back, then cancels', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/admin?tab=purchase-orders')
  // Both order tables mount a "Search orders..." box; the purchase table's is
  // the first on its own tab.
  const search = page.getByPlaceholder(/Search orders/i).first()
  await expect(search).toBeVisible({ timeout: 30_000 })
  await search.fill(String(orderNumber))

  const row = page.locator('tbody tr').first()
  await expect(row, 'the seeded order never appeared in the table').toContainText(
    String(orderNumber),
    { timeout: 20_000 }
  )
  await row.click()

  const drawer = page.getByRole('dialog', { name: /Purchase order/i }).first()
  await expect(drawer).toBeVisible({ timeout: 20_000 })
  await expect(drawer, 'the drawer is not showing the seeded order').toContainText(
    new RegExp(`PO\\s*-\\s*0*${orderNumber}`)
  )

  // FORWARD: In Transit -> Received. The transition buttons carry the
  // destination in their name.
  await drawer.getByRole('button', { name: /Move to Received/i }).click()
  await expect(drawer, 'the order did not reach Received').toContainText(/Received/, {
    timeout: 15_000,
  })

  // BACK: Received -> In Transit. Reversibility is the whole reason this pair
  // is safe to exercise, and asserting it works protects the admin's undo.
  await drawer.getByRole('button', { name: /Back to In Transit/i }).click()
  await expect(
    drawer.getByRole('button', { name: /Move to Received/i }),
    'the order did not come back to In Transit'
  ).toBeVisible({ timeout: 15_000 })

  // CANCEL - the disposable order's terminal state. Some builds confirm; take
  // the confirm if one appears.
  await drawer.getByRole('button', { name: /Cancel Order/i }).click()
  const confirm = page.getByRole('button', { name: /Confirm|Yes|Cancel Order/i }).last()
  await confirm.click({ timeout: 5_000 }).catch(() => {})
  await expect(drawer, 'the order was not cancelled').toContainText(/Cancelled/, {
    timeout: 15_000,
  })
})
