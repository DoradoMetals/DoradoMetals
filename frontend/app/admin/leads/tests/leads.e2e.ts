import { expect, test } from '@playwright/test'
import type { LeadPage, LeadSummary, LeadView } from '@dorado/contracts'

import { statePath } from '@/shared/tests/roles'

import { SIZES, archiveLead, createLead, isResponse } from './leadsE2e'

test.use({ storageState: statePath('admin') })

for (const size of SIZES) {
  test.describe(`the Leads list at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    let created: LeadView | null = null

    test.afterEach(async ({ page }) => {
      if (created) await archiveLead(page, created.id)
      created = null
    })

    test('a lead created through the API shows in the list and opens', async ({ page }) => {
      created = await createLead(page, `list ${size.name}`)
      const summary = page.waitForResponse(isResponse('GET', /\/leads\/summary$/))
      await page.goto('/admin/leads')
      await expect(page.getByRole('heading', { name: 'Leads', level: 1 })).toBeVisible({
        timeout: 30_000,
      })
      const totals = (await (await summary).json()) as LeadSummary
      await expect(
        page.getByText(
          new RegExp(`^${totals.totals.count} leads? · ${totals.totals.unowned} unowned`)
        )
      ).toBeVisible()

      const searched = page.waitForResponse(
        (response) =>
          isResponse('GET', /\/leads$/)(response) &&
          new URL(response.url()).searchParams.get('q') === created!.name
      )
      await page.getByPlaceholder('Name, phone or email').fill(created.name)
      const listed = (await (await searched).json()) as LeadPage
      expect(listed.rows.map((row) => row.id)).toContain(created.id)
      await expect(page.getByText('1 matching')).toBeVisible()
      await expect(page.getByText(created.name)).toBeVisible()
      if (size.name === 'desktop') {
        await expect(page.getByRole('table')).toBeVisible()
      } else {
        await expect(page.getByRole('table')).toHaveCount(0)
      }

      await page.getByRole('link', { name: created.name }).click()
      await expect(page).toHaveURL(new RegExp(`/admin/leads/${created.id}$`))
      await expect(page.getByRole('heading', { name: created.name, level: 1 })).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.getByTestId('lead-header').getByText(created.number)).toBeVisible()
    })
  })
}
