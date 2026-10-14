import { expect, test } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

test.use({ storageState: statePath('admin') })

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const size of SIZES) {
  test.describe(`the Spots board at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('shows the live spots bar above the header', async ({ page }) => {
      await page.goto('/admin/pricing/spots')
      const bar = page.getByRole('region', { name: 'Live spot prices' })
      await expect(bar).toBeVisible({ timeout: 30_000 })
      await expect(bar.getByText('Gold').first()).toBeVisible()
      const barBox = await bar.boundingBox()
      const brandBox = await page
        .getByRole('link', { name: 'Dorado Metals Exchange' })
        .first()
        .boundingBox()
      expect(barBox && brandBox && barBox.y + barBox.height <= brandBox.y).toBeTruthy()
      expect(barBox?.y).toBe(0)
    })

    test('renders four metal cards and the lock list on its Active default', async ({ page }) => {
      await page.goto('/admin/pricing/spots')
      await expect(page.locator('article')).toHaveCount(4, { timeout: 30_000 })
      const locks = page.getByRole('table', { name: 'Order locks' })
      await expect(locks.or(page.getByText('No order locks'))).toBeVisible()
      await expect(locks.getByText('Released')).toHaveCount(0)
      await expect(locks.getByText('Settled')).toHaveCount(0)
    })

    if (size.name === 'desktop') {
      test('the lock status filter switches the rows', async ({ page }) => {
        await page.goto('/admin/pricing/spots')
        const locks = page.getByRole('table', { name: 'Order locks' })
        await page.getByRole('combobox', { name: 'Lock status' }).click()
        await page.getByRole('option', { name: 'Released' }).click()
        await expect(locks.or(page.getByText('No order locks'))).toBeVisible()
        await expect(locks.getByText('Active', { exact: true })).toHaveCount(0)
        await expect(locks.getByText('Settled')).toHaveCount(0)
      })
    }
  })
}
