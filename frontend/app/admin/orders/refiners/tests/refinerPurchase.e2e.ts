import { expect, test, type APIRequestContext, type Page, type Response } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

import { API, adminApi as api, cancelOrder, readOrderId } from './e2eOrders'

test.use({ storageState: statePath('admin') })

type Action = { name: string; confirm: string | null; override: string | null }
type FineOz = { metal_id: string; estimated_content: number | null }
type LotRow = {
  id: string
  order_reference: string | null
  lot: { product_name: string | null; form: string | null; metal_id: string }
}
type Order = {
  id: string
  number: string
  direction: 'sell' | 'buy'
  state: string
  settlement_type: 'paid' | 'pooled'
  settled_at: string | null
  disputed_at: string | null
  dispute_note: string | null
  assigned_to_id: string | null
  refiner: { organization: { name: string } } | null
  location: { city: string | null; state: string | null } | null
  settlement: { state: string; settled_lots: number; lot_count: number }
  fine_oz: FineOz[]
  lots: LotRow[]
  linked_orders: {
    id: string
    reference: string
    customer_name: string | null
    city: string | null
  }[]
  actions: Action[]
}
type Doc = { kind: string; name: string; available: boolean }
type Employee = { user_id: string; name: string; enabled: boolean }

const SIZES = [
  { name: 'desktop', width: 1440, height: 1386 },
  { name: 'mobile', width: 390, height: 844 },
]

const BUY_SET = ['invoice', 'packing_list']

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const lotName = (row: LotRow) => row.lot.product_name ?? row.lot.form ?? row.lot.metal_id

const isRead = (id: string) => (response: Response) =>
  response.request().method() === 'GET' &&
  new RegExp(`/refining/orders/${id}$`).test(response.url())

const isPatch = (id: string) => (response: Response) =>
  response.request().method() === 'PATCH' &&
  new RegExp(`/refining/orders/${id}$`).test(response.url())

const isDocuments = (id: string) => (response: Response) =>
  response.request().method() === 'GET' &&
  new RegExp(`/refining/orders/${id}/documents$`).test(response.url())

async function readOrder(request: APIRequestContext, id: string): Promise<Order> {
  const response = await request.get(`${API}/refining/orders/${id}`)
  expect(response.ok(), `GET /refining/orders/${id} answered ${response.status()}`).toBeTruthy()
  return (await response.json()) as Order
}

async function openOrder(page: Page, id: string): Promise<{ order: Order; docs: Doc[] }> {
  const read = page.waitForResponse(isRead(id))
  const listed = page.waitForResponse(isDocuments(id))
  await page.goto(`/admin/orders/refiners/${id}`)
  const order = (await (await read).json()) as Order
  const docs = (await (await listed).json()) as Doc[]
  await expect(page.getByRole('status', { name: 'Loading refiner order' })).toHaveCount(0, {
    timeout: 30_000,
  })
  return { order, docs }
}

let orderId = ''

test.beforeAll(() => {
  orderId = readOrderId('buy')
})

for (const size of SIZES) {
  test.describe(`the refiner purchase order at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('renders the facts of GET /api/refining/orders/:id', async ({ page }) => {
      const { order, docs } = await openOrder(page, orderId)
      expect(order.direction).toBe('buy')

      await expect(page.getByText(/^(Draft )?Purchase order$/i).first()).toBeVisible()
      await expect(page.getByText(order.state, { exact: true }).first()).toBeVisible()
      if (order.refiner) {
        await expect(page.getByText(order.refiner.organization.name).first()).toBeVisible()
      }
      const place = order.location
        ? [order.location.city, order.location.state].filter(Boolean).join(', ')
        : ''
      await expect(
        page.getByText([order.number, place].filter(Boolean).join(' · '), { exact: true }).first()
      ).toBeVisible()

      await expect(page.getByRole('region', { name: 'Settlement', exact: true })).toHaveCount(0)
      await expect(page.getByRole('group', { name: 'Settlement type' })).toHaveCount(0)

      const fulfillment = page.getByRole('region', { name: 'Fulfillment' }).first()
      await expect(fulfillment).toBeVisible()
      if (order.linked_orders.length === 0) {
        await expect(fulfillment.getByText('No linked orders')).toBeVisible()
      } else {
        for (const linked of order.linked_orders) {
          await expect(fulfillment.getByRole('link', { name: linked.reference })).toHaveAttribute(
            'href',
            new RegExp(`/admin/orders/${escape(linked.id)}$`)
          )
          const who = [linked.customer_name, linked.city].filter(Boolean).join(' · ')
          if (who) await expect(fulfillment.getByText(who, { exact: true })).toBeVisible()
        }
      }

      const lots = page.getByRole('region', { name: 'Lots' }).first()
      await expect(lots).toBeVisible()
      if (order.lots.length === 0) {
        await expect(lots.getByText('No lots yet')).toBeVisible()
      } else {
        for (const row of order.lots) {
          await expect(lots.getByText(lotName(row)).first()).toBeVisible()
          if (row.order_reference) {
            await expect(lots.getByText(row.order_reference).first()).toBeVisible()
          }
        }
      }

      for (const name of ['Spots', 'Totals', 'Charges', 'Payment']) {
        await expect(page.getByRole('region', { name }).first()).toBeVisible()
      }

      expect(docs.map((doc) => doc.kind).sort()).toEqual([...BUY_SET].sort())
      for (const doc of docs) {
        const control = doc.available ? `Download ${doc.name}` : `Import ${doc.name}`
        await expect(page.getByRole('button', { name: control })).toBeVisible()
      }
    })

    test('the assignee changes through PATCH and is restored', async ({ page }) => {
      const { order } = await openOrder(page, orderId)
      const request = await api()
      const employees = (
        (await (await request.get(`${API}/employees`)).json()) as Employee[]
      ).filter((employee) => employee.enabled)
      await request.dispose()
      const other = employees.find((employee) => employee.user_id !== order.assigned_to_id)
      test.skip(!other, 'no enabled employee other than the current assignee')
      const before =
        employees.find((employee) => employee.user_id === order.assigned_to_id)?.name ??
        'Unassigned'

      try {
        const field = page.getByRole('combobox', { name: 'Assigned to' })
        await field.click()
        const changed = page.waitForResponse(isPatch(orderId))
        await page.getByRole('option', { name: other!.name, exact: true }).click()
        const after = (await (await changed).json()) as Order
        expect(after.assigned_to_id).toBe(other!.user_id)
        await expect(field).toHaveText(other!.name)

        await field.click()
        const restored = page.waitForResponse(isPatch(orderId))
        await page.getByRole('option', { name: before, exact: true }).click()
        const back = (await (await restored).json()) as Order
        expect(back.assigned_to_id).toBe(order.assigned_to_id)
        await expect(field).toHaveText(before)
      } finally {
        const restore = await api()
        const now = await readOrder(restore, orderId)
        if (now.assigned_to_id !== order.assigned_to_id) {
          const restored = await restore.patch(`${API}/refining/orders/${orderId}`, {
            data: { assigned_to_id: order.assigned_to_id },
          })
          expect(restored.ok(), `PATCH assignee restore answered ${restored.status()}`).toBeTruthy()
        }
        await restore.dispose()
      }
    })

    test('the Cancel confirm opens and Keep order closes it', async ({ page }) => {
      test.fixme(true, 'no fixture path creates a purchase order that offers cancel')
      const { order } = await openOrder(page, orderId)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: `Cancel ${order.number}?` })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Keep order' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByText(order.state, { exact: true }).first()).toBeVisible()
    })

    test('a buy draft is created and lands on its screen', async ({ page }) => {
      let minted: Promise<string | null> = Promise.resolve(null)
      page.on('response', (response) => {
        if (
          response.request().method() === 'POST' &&
          /\/refining\/orders$/.test(response.url()) &&
          response.status() === 201
        ) {
          minted = response
            .json()
            .then((body) => (body as Order).id)
            .catch(() => null)
        }
      })
      try {
        const refinersRead = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' && /\/suppliers\/get_all$/.test(response.url())
        )
        await page.goto('/admin/orders/refiners/new?direction=buy')
        const refiners = (await (await refinersRead).json()) as {
          id: string
          organization: { name: string }
        }[]
        test.skip(refiners.length === 0, 'no refiner exists')
        await expect(page.getByText(/^Draft purchase order$/i).first()).toBeVisible({
          timeout: 30_000,
        })
        const create = page.getByRole('button', { name: 'Create', exact: true })
        await expect(create).toBeDisabled()

        const locationsRead = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' && /\/locations\?/.test(response.url())
        )
        await page.getByRole('combobox', { name: 'Refiner' }).click()
        await page.getByRole('option', { name: refiners[0].organization.name, exact: true }).click()
        const locations = (await (await locationsRead).json()) as { id: string }[]
        const location = page.getByRole('combobox', { name: 'Location' })
        if (locations.length > 0) {
          await expect(location).toBeEnabled()
          await location.click()
          await page.getByRole('option').first().click()
        }

        const made = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' && /\/refining\/orders$/.test(response.url())
        )
        await create.click()
        const response = await made
        expect(response.status()).toBe(201)
        const order = (await response.json()) as Order
        console.log(`[refinerPurchase] created draft purchase order ${order.id} (${order.number})`)
        expect(order.direction).toBe('buy')
        await expect(page).toHaveURL(new RegExp(`/admin/orders/refiners/${escape(order.id)}$`))
        await expect(page.getByText(order.number, { exact: false }).first()).toBeVisible({
          timeout: 30_000,
        })
      } finally {
        const madeId = await minted
        if (madeId) {
          const request = await api()
          const status = await cancelOrder(request, madeId)
          console.log(`[refinerPurchase] cancelled draft buy order ${madeId}: ${status}`)
          await request.dispose()
        }
      }
    })
  })
}
