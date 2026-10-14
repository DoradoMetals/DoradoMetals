import { expect, test, type Page } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

test.use({ storageState: statePath('admin') })

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

type Band = { min_qty: number; max_qty: number | null; scrap_pct: number; bullion_pct: number }

const goldBands = async (page: Page): Promise<Band[]> => {
  const res = await page.request.get(`${API}/rates?unit=troy_oz`)
  expect(res.ok()).toBeTruthy()
  const rows = (await res.json()) as (Band & { metal_id: string })[]
  return rows
    .filter((row) => row.metal_id === 'Gold')
    .map(({ min_qty, max_qty, scrap_pct, bullion_pct }) => ({
      min_qty,
      max_qty,
      scrap_pct,
      bullion_pct,
    }))
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`the Rates edit flow at ${size.width}`, () => {
    test.use({ viewport: size })

    test('refuses an overlapping band with the api message, then saves the list it holds', async ({
      page,
    }) => {
      await page.goto('/admin/pricing/rates')
      const before = await goldBands(page)
      expect(before.length).toBeGreaterThan(1)

      await page.getByRole('button', { name: 'Edit' }).first().click()
      const second = page.getByLabel('Band 2 up to')
      await second.fill('0.5')
      await page.getByRole('button', { name: 'Save rates' }).click()
      await expect(page.getByText(/band 2 ends at 0\.5/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save rates' })).toBeDisabled()

      await second.fill(String(before[1].max_qty ?? ''))
      await page.getByRole('button', { name: 'Save rates' }).click()
      await expect(page.getByRole('button', { name: 'Save rates' })).toHaveCount(0)
      expect(await goldBands(page)).toEqual(before)

      const changes = page.getByRole('table', { name: 'Rate changes' })
      const empty = page.getByText('No rate changes')
      await expect(changes.or(empty)).toBeVisible()
      if ((await changes.count()) > 0) {
        if (size.width > 1000) {
          await expect(changes.getByRole('columnheader', { name: 'OLD RANGE' })).toBeVisible()
          await expect(changes.getByRole('columnheader', { name: 'NEW RANGE' })).toBeVisible()
        } else {
          await expect(changes.getByText('Old range').first()).toBeVisible()
          await expect(changes.getByText('New range').first()).toBeVisible()
        }
      }
    })
  })
}
