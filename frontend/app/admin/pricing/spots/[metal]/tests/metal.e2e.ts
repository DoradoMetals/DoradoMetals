import { expect, test } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

test.use({ storageState: statePath('admin') })

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`the Gold page at ${size.width}`, () => {
    test.use({ viewport: size })

    test('shows the history chart with four range chips and the three accordions', async ({
      page,
    }) => {
      await page.goto('/admin/pricing/spots/Gold')
      await expect(page.getByRole('heading', { name: 'Gold', exact: true, level: 2 })).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.getByRole('img', { name: /Gold bid/ })).toBeVisible()
      for (const chip of ['1D', '1W', '1M', '1Y']) {
        await expect(page.getByRole('button', { name: chip, exact: true })).toBeVisible()
      }
      for (const section of ['Spot', 'Source', 'Adjustment']) {
        await expect(
          page.getByRole('button', { name: new RegExp(`^${section}\\b(?!s)`) })
        ).toBeVisible()
      }
      await page.getByRole('button', { name: '1W', exact: true }).click()
      await expect(page.getByText('Gold spot, this week')).toBeVisible()
    })
  })
}
