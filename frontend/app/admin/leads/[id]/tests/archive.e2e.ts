import { expect, test } from '@playwright/test'
import type { LeadView } from '@dorado/contracts'

import { statePath } from '@/shared/tests/roles'

import { SIZES, api, archiveLead, createLead, isResponse, openLead } from '../../tests/leadsE2e'

test.use({ storageState: statePath('admin') })

for (const size of SIZES) {
  test.describe(`archiving a lead at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    let created: LeadView | null = null

    test.afterEach(async ({ page }) => {
      if (created) await archiveLead(page, created.id)
      created = null
    })

    test('Delete archives the lead, the Archived chip lists it, and Restore brings it back', async ({
      page,
    }) => {
      created = await createLead(page, `archive ${size.name}`)
      await openLead(page, created.id, created.name)
      const header = page.getByTestId('lead-header')

      await header.getByRole('button', { name: 'Delete' }).click()
      const dialog = page
        .getByRole('alertdialog')
        .filter({ has: page.getByRole('heading', { name: 'Delete this lead?' }) })
      await expect(dialog.getByText('It moves to the archive and can be restored.')).toBeVisible()
      const archived = page.waitForResponse(
        isResponse('DELETE', new RegExp(`/leads/${created.id}$`))
      )
      await dialog.getByRole('button', { name: 'Delete' }).click()
      expect((await archived).status()).toBe(200)
      await expect(header.getByText('Archived')).toBeVisible()
      await expect(header.getByRole('button', { name: 'Restore' })).toBeVisible()
      await expect(header.getByRole('button', { name: 'Delete' })).toHaveCount(0)
      const read = await api<LeadView>(page, 'GET', `/leads/${created.id}`)
      expect(read.body.archived_at).not.toBeNull()

      await page.goto('/admin/leads')
      await expect(page.getByRole('heading', { name: 'Leads', level: 1 })).toBeVisible({
        timeout: 30_000,
      })
      await page.getByPlaceholder('Name, phone or email').fill(created.name)
      await expect(page.getByText('0 matching')).toBeVisible()
      const listed = page.waitForResponse(
        (response) =>
          isResponse('GET', /\/leads$/)(response) &&
          new URL(response.url()).searchParams.get('archived') === 'true'
      )
      await page.getByRole('radio', { name: /^Archived/ }).click()
      await listed
      await expect(page.getByText(created.name)).toBeVisible()

      await openLead(page, created.id, created.name)
      const restored = page.waitForResponse(
        isResponse('POST', new RegExp(`/leads/${created.id}/restore$`))
      )
      await page.getByTestId('lead-header').getByRole('button', { name: 'Restore' }).click()
      expect((await restored).status()).toBe(200)
      await expect(
        page.getByTestId('lead-header').getByRole('button', { name: 'Delete' })
      ).toBeVisible()
      const back = await api<LeadView>(page, 'GET', `/leads/${created.id}`)
      expect(back.body.archived_at).toBeNull()
    })
  })
}
