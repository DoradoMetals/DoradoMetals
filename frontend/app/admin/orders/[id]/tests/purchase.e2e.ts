import { expect, test, type Page } from '@playwright/test'
import type { OrderPricing, OrderView } from '@dorado/contracts'

import { formatTotal } from '@/app/admin/orders/_lib/format'
import { statePath } from '@/shared/tests/roles'

import {
  SIZES,
  actionOf,
  api,
  assertColumns,
  card,
  cardNames,
  dialog,
  fixtures,
  isResponse,
  openOrder,
  viewOf,
  type Width,
} from './orderScreen'

test.use({ storageState: statePath('admin') })

const MAIN = ['shipment', 'spots', 'lots', 'lot-photos', 'charges', 'payment', 'activity']
const ASIDE = ['totals', 'profit', 'documents', 'chat', 'notes']

async function settleUnlocked(page: Page, id: string): Promise<OrderView> {
  const view = await viewOf(page, id)
  if (view.order.spots_locked && view.totals?.total == null) {
    const { status } = await api(page, 'PUT', `/orders/${id}/spots`, { lock: false })
    expect(status).toBe(200)
    return await viewOf(page, id)
  }
  return view
}

async function toggleSpots(page: Page, id: string, lock: boolean): Promise<void> {
  const view = await viewOf(page, id)
  const action = actionOf(view, lock ? 'lock_spots' : 'unlock_spots')
  expect(action, `the API offers ${lock ? 'lock' : 'unlock'}_spots`).toBeTruthy()
  const label = lock ? 'Lock spots' : 'Unlock spots'
  const put = page.waitForResponse(isResponse('PUT', new RegExp(`/orders/${id}/spots$`)))
  await card(page, 'spots').getByRole('button', { name: label }).click()
  if (action?.override) {
    const box = dialog(page, `${label}?`)
    await expect(box).toContainText(action.override)
    await box.getByLabel('Reason').fill('e2e spot lock round trip')
    await box.getByRole('button', { name: label }).click()
  } else if (action?.confirm) {
    const box = dialog(page, `${label}?`)
    await expect(box).toContainText(action.confirm)
    await box.getByRole('button', { name: label }).click()
  } else {
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  expect((await put).status()).toBe(200)
  await expect.poll(async () => (await viewOf(page, id)).order.spots_locked).toBe(lock)
  await expect(
    card(page, 'spots').getByRole('button', { name: lock ? 'Unlock spots' : 'Lock spots' })
  ).toBeEnabled()
}

const premiumField = (page: Page, width: Width, name: string) =>
  width === 'desktop'
    ? card(page, 'lots').getByLabel(`Premium, ${name}`)
    : card(page, 'lots')
        .locator('[data-layout="mobile"][data-type]')
        .filter({ hasText: name })
        .getByLabel('Premium')

for (const size of SIZES) {
  test.describe(`the purchase order screen at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('renders the cards in order with the order facts from the API', async ({ page }) => {
      const { purchase } = fixtures()
      const view = await settleUnlocked(page, purchase)
      const pricing = await api<OrderPricing>(page, 'POST', '/quotes/order', { order_id: purchase })
      expect(pricing.status).toBe(200)

      const screen = await openOrder(page, purchase)
      await expect(screen).toHaveAttribute('data-direction', 'purchase')
      await expect(screen).toHaveAttribute('data-layout', size.name)
      await expect(page.getByText('Purchase order').first()).toBeVisible()
      await expect(page.getByText(view.reference).first()).toBeVisible()

      await expect(card(page, 'activity')).toBeVisible()
      const main = (await cardNames(page.getByTestId('order-main'))).filter((n) => n !== 'dispute')
      expect(main).toEqual(MAIN)
      expect(await cardNames(page.getByTestId('order-aside'))).toEqual(ASIDE)

      const lots = card(page, 'lots')
      for (const row of view.lots) await expect(lots.getByText(row.name).first()).toBeVisible()
      if (size.name === 'desktop') {
        for (const row of view.lots) {
          if (row.lot.reference) await expect(lots.getByText(row.lot.reference)).toBeVisible()
        }
      }
      await expect(card(page, 'spots').getByRole('button', { name: 'Lock spots' })).toBeEnabled()
      await expect(card(page, 'totals')).toContainText(formatTotal(pricing.body.bullion_total))
      await expect(card(page, 'payment')).toContainText(view.payout?.account_holder_name ?? '')
      await expect(page.getByRole('button', { name: 'Finalize' })).toBeVisible()
      await assertColumns(page, size.name)
    })

    test('locks and unlocks the spots, and the API agrees each time', async ({ page }) => {
      const { purchase } = fixtures()
      await settleUnlocked(page, purchase)
      await openOrder(page, purchase)
      await toggleSpots(page, purchase, true)
      await toggleSpots(page, purchase, false)
    })

    test('the finalize confirm shows the API reason, and Cancel keeps the order open', async ({
      page,
    }) => {
      const { purchase } = fixtures()
      const view = await settleUnlocked(page, purchase)
      const action = actionOf(view, 'finalize')
      expect(action, 'the API offers finalize').toBeTruthy()
      await openOrder(page, purchase)
      await page.getByRole('button', { name: 'Finalize' }).click()
      const box = dialog(page, 'Finalize this order?')
      await expect(box).toBeVisible()
      if (action?.confirm) await expect(box).toContainText(action.confirm)
      await box.getByRole('button', { name: 'Cancel' }).click()
      await expect(box).toHaveCount(0)
      const after = await viewOf(page, purchase)
      expect(after.order.spots_locked).toBe(false)
      expect(after.totals?.total ?? null).toBeNull()
    })

    test('Finalize on a disposable purchase locks the spots and writes the total', async ({
      page,
    }) => {
      const id = fixtures().disposable_purchases[size.name]
      const view = await viewOf(page, id)
      test.skip(
        actionOf(view, 'finalize') == null,
        'this disposable purchase is already final - run `pnpm seed` for a fresh one'
      )
      await openOrder(page, id)
      await page.getByRole('button', { name: 'Finalize' }).click()
      const box = dialog(page, 'Finalize this order?')
      const posted = page.waitForResponse(isResponse('POST', new RegExp(`/orders/${id}/finalize$`)))
      await box.getByRole('button', { name: 'Finalize' }).click()
      expect((await posted).status()).toBe(200)
      const after = await viewOf(page, id)
      expect(after.order.spots_locked).toBe(true)
      expect(after.totals?.total).not.toBeNull()
      await expect(page.getByRole('button', { name: 'Finalize' })).toHaveCount(0)
      await expect(card(page, 'spots').getByRole('button', { name: /lock spots/i })).toBeDisabled()
    })

    test('a save over a change made elsewhere shows the stale notice and saves nothing', async ({
      page,
    }) => {
      const { purchase } = fixtures()
      const view = await settleUnlocked(page, purchase)
      const row = view.lots[0]
      await openOrder(page, purchase)
      const field = premiumField(page, size.name, row.name)
      await expect(field).toBeEditable()

      const elsewhere = await api(page, 'PATCH', `/orders/lots/${row.id}`, {
        premium: row.lot.premium,
      })
      expect(elsewhere.status).toBe(200)

      const shown = await field.inputValue()
      const patched = page.waitForResponse(
        isResponse('PATCH', new RegExp(`/orders/lots/${row.id}$`))
      )
      await field.fill(String((Number.parseFloat(shown) || 0) + 1))
      await field.press('Tab')
      const response = await patched
      expect(response.status()).toBe(409)
      expect(await response.text()).toContain('changed since this screen loaded')

      const notice = page.getByTestId('order-notice')
      await expect(notice).toHaveAttribute('data-kind', 'stale')
      await expect(notice).toContainText('This order changed')
      await expect(field).toHaveValue(shown)
      const after = await viewOf(page, purchase)
      expect(after.lots.find((lot) => lot.id === row.id)?.lot.premium).toBe(row.lot.premium)
    })
  })
}
