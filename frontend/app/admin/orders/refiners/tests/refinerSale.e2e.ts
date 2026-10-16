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
  refiner_id: string
  sent_at: string | null
  cancelled_at: string | null
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
  actions: Action[]
}
type Doc = { kind: string; name: string; available: boolean }
type Employee = { user_id: string; name: string; enabled: boolean }

const SIZES = [
  { name: 'desktop', width: 1440, height: 1386 },
  { name: 'mobile', width: 390, height: 844 },
]

const SELL_SET = ['invoice', 'lot_manifest', 'settlement']

const fineOz = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const offers = (order: Order, name: string) => order.actions.some((a) => a.name === name)

const lotName = (row: LotRow) => row.lot.product_name ?? row.lot.form ?? row.lot.metal_id

const badgeLabel = (order: Order) =>
  order.settlement.state === 'Pending'
    ? 'Pending Assay'
    : order.settlement.state === 'Partial'
      ? `${order.settlement.settled_lots} of ${order.settlement.lot_count} settled`
      : order.settlement.state

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
  orderId = readOrderId('sell')
})

for (const size of SIZES) {
  test.describe(`the refiner sales order at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('renders the facts of GET /api/refining/orders/:id', async ({ page }) => {
      const { order, docs } = await openOrder(page, orderId)
      expect(order.direction).toBe('sell')

      await expect(page.getByText(/^(Draft )?Sales order$/i).first()).toBeVisible()
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

      const settlement = page.getByRole('region', { name: 'Settlement', exact: true }).first()
      await expect(settlement).toBeVisible()
      await expect(settlement).toHaveAttribute('data-state', order.settlement.state)
      await expect(settlement.getByText(badgeLabel(order), { exact: true })).toBeVisible()
      await expect(settlement).toHaveAttribute(
        'data-type',
        order.settlement_type === 'pooled' ? 'pooled' : 'paid'
      )
      const estimated = order.fine_oz.filter((row) => row.estimated_content !== null)
      for (const row of estimated) {
        await expect(
          settlement
            .getByText(
              `${fineOz.format(row.estimated_content as number)} oz ${row.metal_id.toLowerCase()}`,
              { exact: true }
            )
            .first()
        ).toBeVisible()
      }
      await expect(
        settlement.getByRole('group', { name: 'Settlement type' }).getByRole('button')
      ).toHaveText(['Paid at settlement', 'Pooled'])

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

      for (const name of ['Totals', 'Charges', 'Payment']) {
        await expect(page.getByRole('region', { name }).first()).toBeVisible()
      }
      await expect(page.getByRole('region', { name: 'Fulfillment' })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Spots' })).toHaveCount(0)

      expect(docs.map((doc) => doc.kind).sort()).toEqual([...SELL_SET].sort())
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

    test('the settlement type chip switches and is restored while unsettled', async ({ page }) => {
      const { order } = await openOrder(page, orderId)
      const unsettled =
        order.state !== 'Cancelled' &&
        order.settled_at === null &&
        order.settlement.settled_lots === 0
      const group = page
        .getByRole('region', { name: 'Settlement', exact: true })
        .first()
        .getByRole('group', { name: 'Settlement type' })
      if (!unsettled) {
        await expect(group.getByRole('button', { name: 'Pooled' })).toBeDisabled()
        return
      }
      const start = order.settlement_type
      const target = start === 'pooled' ? 'Paid at settlement' : 'Pooled'
      const home = start === 'pooled' ? 'Pooled' : 'Paid at settlement'

      try {
        const changed = page.waitForResponse(isPatch(orderId))
        await group.getByRole('button', { name: target }).click()
        const after = (await (await changed).json()) as Order
        expect(after.settlement_type).toBe(start === 'pooled' ? 'paid' : 'pooled')
        await expect(group.getByRole('button', { name: target })).toHaveAttribute(
          'aria-pressed',
          'true'
        )

        const restored = page.waitForResponse(isPatch(orderId))
        await group.getByRole('button', { name: home }).click()
        const back = (await (await restored).json()) as Order
        expect(back.settlement_type).toBe(start)
        await expect(group.getByRole('button', { name: home })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
      } finally {
        const restore = await api()
        const now = await readOrder(restore, orderId)
        if (now.settlement_type !== start) {
          const restored = await restore.patch(`${API}/refining/orders/${orderId}`, {
            data: { settlement_type: start },
          })
          expect(
            restored.ok(),
            `PATCH settlement restore answered ${restored.status()}`
          ).toBeTruthy()
        }
        await restore.dispose()
      }
    })

    test('a dispute set by PATCH resolves through its confirm', async ({ page }) => {
      const request = await api()
      const start = await readOrder(request, orderId)
      expect(start.state, 'the setup picks a sales order that is not cancelled').not.toBe(
        'Cancelled'
      )
      if (start.disputed_at !== null) {
        const cleared = await request.patch(`${API}/refining/orders/${orderId}`, {
          data: { disputed_at: null, dispute_note: null },
        })
        expect(cleared.ok(), `PATCH clear dispute answered ${cleared.status()}`).toBeTruthy()
      }
      const note = 'e2e dispute: assay out of tolerance'
      const disputed = await request.patch(`${API}/refining/orders/${orderId}`, {
        data: { disputed_at: new Date().toISOString(), dispute_note: note },
      })
      expect(disputed.ok(), `PATCH dispute answered ${disputed.status()}`).toBeTruthy()

      try {
        const { order } = await openOrder(page, orderId)
        expect(offers(order, 'resolve_dispute')).toBeTruthy()
        const settlement = page.getByRole('region', { name: 'Settlement', exact: true }).first()
        await expect(settlement).toHaveAttribute('data-state', 'Disputed')
        await expect(settlement.getByText('Assay disputed')).toBeVisible()
        await expect(settlement.getByText(note)).toBeVisible()

        await settlement.getByRole('button', { name: 'Resolve dispute' }).click()
        const dialog = page.getByRole('dialog', {
          name: `Resolve the dispute on ${order.number}?`,
        })
        await expect(dialog).toBeVisible()
        const resolved = page.waitForResponse(isPatch(orderId))
        await dialog.getByRole('button', { name: 'Resolve dispute' }).click()
        const after = (await (await resolved).json()) as Order
        expect(after.disputed_at).toBeNull()
        await expect(dialog).toHaveCount(0)
        await expect(settlement.getByRole('button', { name: 'Resolve dispute' })).toHaveCount(0)
        await expect(settlement).not.toHaveAttribute('data-state', 'Disputed')
      } finally {
        const restored = await request.patch(`${API}/refining/orders/${orderId}`, {
          data: { disputed_at: null, dispute_note: start.dispute_note },
        })
        expect(restored.ok(), `PATCH restore answered ${restored.status()}`).toBeTruthy()
        await request.dispose()
      }
    })

    test('the Cancel confirm opens and Keep order closes it', async ({ page }) => {
      test.fixme(true, 'no fixture path creates a sales order that offers cancel')
      const { order } = await openOrder(page, orderId)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: `Cancel ${order.number}?` })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Keep order' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByText(order.state, { exact: true }).first()).toBeVisible()
    })

    test('the Match drawer opens from the settlement Import row', async ({ page }) => {
      test.fixme(
        true,
        'no fixture path guarantees an order whose settlement file is not yet imported'
      )
      const { docs } = await openOrder(page, orderId)
      const settlementDoc = docs.find((doc) => doc.kind === 'settlement')
      expect(settlementDoc, 'the documents read has a settlement row').toBeTruthy()
      await page.route(
        new RegExp(`/refining/orders/${orderId}/documents/settlement$`),
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback()
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ ...settlementDoc, available: true }),
          })
        }
      )
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: `Import ${settlementDoc!.name}` }).click()
      await (
        await chooser
      ).setFiles({
        name: 'settlement.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
      })
      const drawer = page.getByRole('dialog', { name: 'Match settlement lines' })
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Apply matches' })).toBeVisible()
      await drawer.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(drawer).toHaveCount(0)
    })

    test('a sell draft is created and lands on its screen', async ({ page }) => {
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
        await page.goto('/admin/orders/refiners/new?direction=sell')
        const refiners = (await (await refinersRead).json()) as {
          id: string
          organization: { name: string }
        }[]
        const request = await api()
        const listed = await request.get(`${API}/refining/orders?direction=sell&limit=200`)
        expect(listed.ok(), `GET /refining/orders answered ${listed.status()}`).toBeTruthy()
        const { items } = (await listed.json()) as { items: Order[] }
        await request.dispose()
        const busy = new Set(
          items
            .filter((item) => item.sent_at === null && item.cancelled_at === null)
            .map((item) => item.refiner_id)
        )
        const free = refiners.find((refiner) => !busy.has(refiner.id))
        test.skip(!free, 'every refiner already has an open sales order')
        await expect(page.getByText(/^Draft sales order$/i).first()).toBeVisible({
          timeout: 30_000,
        })
        const create = page.getByRole('button', { name: 'Create', exact: true })
        await expect(create).toBeDisabled()

        const locationsRead = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' && /\/locations\?/.test(response.url())
        )
        await page.getByRole('combobox', { name: 'Refiner' }).click()
        await page.getByRole('option', { name: free!.organization.name, exact: true }).click()
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
        console.log(`[refinerSale] created draft sales order ${order.id} (${order.number})`)
        expect(order.direction).toBe('sell')
        await expect(page).toHaveURL(new RegExp(`/admin/orders/refiners/${escape(order.id)}$`))
        await expect(page.getByText(order.number, { exact: false }).first()).toBeVisible({
          timeout: 30_000,
        })
      } finally {
        const madeId = await minted
        if (madeId) {
          const request = await api()
          const status = await cancelOrder(request, madeId)
          console.log(`[refinerSale] cancelled draft sell order ${madeId}: ${status}`)
          await request.dispose()
        }
      }
    })
  })
}
