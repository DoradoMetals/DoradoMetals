import { expect, test } from '@playwright/test'
import type { EstimateItemView, LeadView } from '@dorado/contracts'

import { statePath } from '@/shared/tests/roles'

import {
  API,
  SIZES,
  api,
  archiveLead,
  card,
  createLead,
  isResponse,
  openLead,
} from '../../tests/leadsE2e'

test.use({ storageState: statePath('admin') })

const FRONT = new URL(process.env.BASE_URL ?? 'http://localhost:3000').origin

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

for (const size of SIZES) {
  test.describe(`the lead Estimate at ${size.width}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    let created: LeadView | null = null

    test.afterEach(async ({ page }) => {
      if (created) await archiveLead(page, created.id)
      created = null
    })

    test('adds an estimate item, attaches an image and shows the count', async ({ page }) => {
      created = await createLead(page, `estimate ${size.name}`)
      await page.route(
        (url) => url.origin !== new URL(API).origin && url.origin !== FRONT,
        async (route) => {
          if (route.request().method() === 'PUT') await route.fulfill({ status: 200, body: '' })
          else await route.continue()
        }
      )
      await openLead(page, created.id, created.name)
      const estimate = card(page, 'estimate')
      await expect(estimate).toBeVisible()

      await estimate.getByRole('button', { name: 'Add item' }).click()
      const drawer = page
        .getByRole('dialog')
        .filter({ has: page.getByRole('heading', { name: 'Add item' }) })
      await expect(drawer).toBeVisible()
      await drawer
        .getByRole('radio', { name: 'Scrap' })
        .or(drawer.getByRole('button', { name: 'Scrap' }))
        .click()
      await drawer
        .getByRole('radio', { name: 'Gold' })
        .or(drawer.getByRole('button', { name: 'Gold' }))
        .click()
      await drawer
        .getByRole('radio', { name: '14K' })
        .or(drawer.getByRole('button', { name: '14K' }))
        .click()
      await drawer.getByLabel(/^Weight/).fill('12')
      await drawer
        .getByRole('radio', { name: 'Grams', exact: true })
        .or(drawer.getByRole('button', { name: 'Grams', exact: true }))
        .click()
      const added = page.waitForResponse(
        isResponse('POST', new RegExp(`/leads/${created.id}/estimate/items$`))
      )
      await drawer.getByRole('button', { name: 'Add to estimate' }).click()
      const item = (await (await added).json()) as EstimateItemView
      expect((await added).status()).toBe(201)

      await expect(estimate.getByText('14K').first()).toBeVisible()
      const priced = await api<{ total: number }>(
        page,
        'GET',
        `/pricing/lead-estimates/${created.id}`
      )
      expect(priced.status).toBe(200)

      await estimate.getByRole('checkbox').last().check()
      await estimate.getByRole('button', { name: 'Attach images' }).click()
      const linked = page.waitForResponse(
        isResponse('POST', new RegExp(`/leads/${created.id}/estimate/items/${item.id}/images$`))
      )
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'ring.png',
        mimeType: 'image/png',
        buffer: PNG,
      })
      const upload = page.getByRole('dialog').getByRole('button', { name: /^(Upload|Attach)/ })
      if (await upload.count()) await upload.first().click()
      expect((await linked).status()).toBe(201)

      await expect
        .poll(async () => {
          const { body } = await api<EstimateItemView[]>(
            page,
            'GET',
            `/leads/${created!.id}/estimate/items`
          )
          return body.find((row) => row.id === item.id)?.image_count
        })
        .toBe(1)
      await expect(estimate.getByText('1', { exact: true })).toBeVisible()
    })
  })
}
