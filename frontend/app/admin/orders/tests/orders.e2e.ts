import { expect, test, type Page, type Response } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

test.use({ storageState: statePath('admin') })

type ListItem = { id: string; reference: string; actions: { name: string }[] }
type ListBody = { counts: { orders: number; unassigned_lots: number }; items: ListItem[] }

const isList = (response: Response) =>
  response.request().method() === 'GET' && /\/orders\?/.test(response.url())

const isSelection = (response: Response) => /\/pricing\/selection\?/.test(response.url())

async function openList(page: Page): Promise<ListBody> {
  const listed = page.waitForResponse(isList)
  await page.goto('/admin/orders')
  return (await (await listed).json()) as ListBody
}

const SIZES = [
  { name: 'desktop', width: 1440, height: 1386 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const size of SIZES) {
  test.describe(`the Orders list at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('renders the header frame and one card per order from GET /api/orders', async ({
      page,
    }) => {
      const body = await openList(page)
      await expect(page.getByRole('heading', { name: 'Orders & Lots' })).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Purchases' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sales' })).toBeVisible()
      await expect(page.getByRole('radio', { name: 'Cancelled' })).toBeAttached()
      await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeAttached()
      if (body.items.length === 0) {
        await expect(page.getByText('No orders here')).toBeVisible()
      } else {
        await expect(page.locator('article')).toHaveCount(body.items.length)
        await expect(page.locator('article').first().getByRole('link')).toHaveAttribute(
          'href',
          new RegExp(`/admin/orders/${body.items[0].id}$`)
        )
      }
      await expect(
        page.getByText(`${body.counts.orders} order${body.counts.orders === 1 ? '' : 's'}`).first()
      ).toBeVisible()
    })

    test('the state chips filter the list', async ({ page }) => {
      await openList(page)
      const filtered = page.waitForResponse(
        (response) => isList(response) && response.url().includes('state=Cancelled')
      )
      await page.getByRole('radio', { name: 'Cancelled' }).click()
      const body = (await (await filtered).json()) as ListBody
      if (body.items.length === 0) {
        await expect(page.getByText('No orders here')).toBeVisible()
      } else {
        await expect(page.locator('article')).toHaveCount(body.items.length)
        await expect(
          page.locator('article').getByText('Cancelled', { exact: true }).first()
        ).toBeVisible()
      }
      await page.getByRole('radio', { name: 'All', exact: true }).click()
      await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeChecked()
    })

    test('the Sales chip switches direction and the state row', async ({ page }) => {
      await openList(page)
      const sales = page.waitForResponse(
        (response) => isList(response) && response.url().includes('direction=sale')
      )
      await page.getByRole('button', { name: 'Sales' }).click()
      await sales
      await expect(page.getByRole('radio', { name: 'Awaiting Payment' })).toBeAttached()
      await expect(page.getByRole('radio', { name: 'Awaiting Receipt' })).toHaveCount(0)
    })

    test('selecting two cards shows the bar with the server numbers and the batch rule', async ({
      page,
    }) => {
      const body = await openList(page)
      test.skip(body.items.length < 2, 'the dev database holds fewer than two purchases')
      const boxes = page.locator('article').getByRole('checkbox')
      await expect(boxes.first()).toBeVisible({ timeout: 30_000 })
      const both = page.waitForResponse(
        (response) =>
          isSelection(response) &&
          new URL(response.url()).searchParams.getAll('order_ids').length === 2
      )
      await boxes.nth(0).click()
      await boxes.nth(1).click()
      const summary = (await (await both).json()) as { order_count: number; lot_count: number }
      const bar = page.getByRole('region', { name: 'Selection' })
      await expect(bar).toBeVisible()
      await expect(
        bar.getByText(`${summary.order_count} orders selected · ${summary.lot_count} lot`, {
          exact: false,
        })
      ).toBeVisible()
      await expect(bar.getByText(/est\./)).toBeVisible()

      const picked = body.items.slice(0, 2)
      const allOffer = picked.every((item) => item.actions.some((a) => a.name === 'assign_lots'))
      const control = bar.getByRole('combobox')
      if (allOffer) await expect(control).toBeEnabled()
      else await expect(control).toBeDisabled()
      await expect(bar.getByText(size.name === 'mobile' ? 'Send to' : 'Batch into')).toBeVisible()
    })

    test('the context menu lists the card actions and View', async ({ page }) => {
      const body = await openList(page)
      test.skip(body.items.length < 1, 'the dev database holds no purchases')
      await page.locator('article').first().click({ button: 'right' })
      const menu = page.getByRole('menu')
      await expect(menu.getByRole('menuitem', { name: 'View' })).toBeVisible()
      await expect(menu.getByRole('menuitem')).toHaveCount(1 + body.items[0].actions.length)
      await page.keyboard.press('Escape')
    })

    if (size.name === 'desktop') {
      test('lays four cards across the row', async ({ page }) => {
        const body = await openList(page)
        test.skip(body.items.length < 2, 'the dev database holds fewer than two purchases')
        const cards = page.locator('article')
        await expect(cards.first()).toBeVisible({ timeout: 30_000 })
        const first = await cards.nth(0).boundingBox()
        const second = await cards.nth(1).boundingBox()
        expect(first && second && Math.abs(first.y - second.y) < 2).toBeTruthy()
        expect(first && first.width).toBeLessThan(400)
      })
    } else {
      test('stacks the cards in one column and keeps the controls in the header', async ({
        page,
      }) => {
        const body = await openList(page)
        await expect(page.getByRole('heading', { name: 'Orders & Lots' })).toBeVisible({
          timeout: 30_000,
        })
        await expect(page.getByRole('combobox', { name: 'Show' })).toBeVisible()
        await expect(page.getByRole('combobox', { name: 'Assigned to' })).toBeVisible()
        await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
        if (body.items.length >= 2) {
          const cards = page.locator('article')
          const first = await cards.nth(0).boundingBox()
          const second = await cards.nth(1).boundingBox()
          expect(first && second && second.y > first.y + first.height - 1).toBeTruthy()
          expect(first && first.width).toBeGreaterThan(300)
        }
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scroll).toBeLessThanOrEqual(390)
      })
    }
  })
}
