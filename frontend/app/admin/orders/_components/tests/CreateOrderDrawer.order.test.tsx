import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { emptyDrawerState } from '../../_lib/createOrder'
import {
  EMPLOYEE,
  IDS,
  desktop,
  drawer,
  lastPreview,
  mountDrawer,
  pickCustomer,
  previews,
  purchaseState,
  stubDrawerApi,
  writes,
} from './createOrderFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => desktop(true))
afterEach(() => vi.unstubAllGlobals())

describe('the Create Order drawer frame', () => {
  test('opens as New order with the four-step indicator, Cancel and Continue', async () => {
    stubDrawerApi()
    mountDrawer()
    const dialog = await drawer()
    expect(within(dialog).getByRole('heading', { name: 'New order' })).toBeTruthy()
    for (const step of ['Order', 'Fulfillment', 'Transaction', 'Review']) {
      expect(within(dialog).getByText(step)).toBeTruthy()
    }
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  test('the header and footer stay put; only the body scrolls', async () => {
    stubDrawerApi()
    mountDrawer()
    const dialog = await drawer()
    const scrolling = Array.from(dialog.querySelectorAll('*')).filter((el) =>
      String((el as HTMLElement).className).includes('overflow-y-auto')
    )
    expect(scrolling).toHaveLength(1)
    const body = scrolling[0] as HTMLElement
    expect(within(body).getByText('What kind of order?')).toBeTruthy()
    expect(body.contains(within(dialog).getByRole('heading', { name: 'New order' }))).toBe(false)
    expect(body.contains(within(dialog).getByRole('button', { name: 'Continue' }))).toBe(false)
  })

  test('Cancel closes the drawer and writes nothing', async () => {
    const hits = stubDrawerApi()
    const { onOpenChange } = mountDrawer()
    fireEvent.click(within(await drawer()).getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(writes(hits)).toHaveLength(0)
  })

  test('the mobile layout names the step under the indicator and pins Continue above Cancel', async () => {
    desktop(false)
    stubDrawerApi()
    mountDrawer({ layout: 'mobile' })
    const dialog = await drawer()
    expect(within(dialog).getByText('Step 1 of 4 · Order')).toBeTruthy()
    const buttons = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(buttons.indexOf('Continue')).toBeLessThan(buttons.indexOf('Cancel'))
  })
})

describe('Kind', () => {
  test('four kind tiles, Customer Purchase chosen by default', async () => {
    stubDrawerApi()
    mountDrawer()
    const dialog = await drawer()
    const tiles = ['Customer Purchase', 'Customer Sale', 'Refiner Purchase', 'Refiner Sale'].map(
      (name) => within(dialog).getByRole('radio', { name: new RegExp(name) })
    )
    expect(tiles[0]!.getAttribute('aria-checked')).toBe('true')
    expect(within(dialog).getByText('We buy scrap or bullion from a customer.')).toBeTruthy()
    expect(within(dialog).getByText('We send our lots to a refiner.')).toBeTruthy()
  })

  test('a kind fixed by the screen is prefilled and locked', async () => {
    stubDrawerApi()
    mountDrawer({ initial: emptyDrawerState('refiner_sale'), locked: { kind: true } })
    const dialog = await drawer()
    const chosen = within(dialog).getByRole('radio', { name: /Refiner Sale/ })
    expect(chosen.getAttribute('aria-checked')).toBe('true')
    for (const name of ['Customer Purchase', 'Customer Sale', 'Refiner Purchase', 'Refiner Sale']) {
      const tile = within(dialog).getByRole('radio', { name: new RegExp(name) })
      expect(tile.hasAttribute('disabled') || tile.getAttribute('aria-disabled') === 'true').toBe(
        true
      )
    }
  })

  test('choosing a refiner kind swaps the Customer field for Refiner, Settlement type and Location', async () => {
    stubDrawerApi()
    mountDrawer()
    const dialog = await drawer()
    expect(within(dialog).getByRole('combobox', { name: 'Customer' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Refiner Sale/ }))
    expect(await within(dialog).findByRole('combobox', { name: 'Refiner' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Settlement type' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Location' })).toBeTruthy()
    expect(within(dialog).queryByRole('combobox', { name: 'Customer' })).toBeNull()
  })
})

describe('Party', () => {
  test('the customer search finds by name and selects the customer', async () => {
    const hits = stubDrawerApi()
    mountDrawer()
    await pickCustomer()
    const search = hits.find((hit) => hit.path === '/search')
    expect(search?.url.searchParams.get('q')).toBe('Marg')
    const dialog = await drawer()
    await waitFor(() =>
      expect(
        (within(dialog).getByRole('combobox', { name: 'Customer' }) as HTMLInputElement).value
      ).toBe('Marguerite Whitfield')
    )
  })

  test('a customer fixed by the customer screen is prefilled and locked', async () => {
    stubDrawerApi()
    mountDrawer({ initial: { customer_id: IDS.customer }, locked: { customer: true } })
    const dialog = await drawer()
    const field = within(dialog).getByRole('combobox', { name: 'Customer' }) as HTMLInputElement
    await waitFor(() => expect(field.value).toBe('Marguerite Whitfield'))
    expect(field.hasAttribute('disabled') || field.readOnly).toBe(true)
  })

  test('an owner sees Assigned to as a choice, prefilled from the employee screen', async () => {
    stubDrawerApi()
    mountDrawer({ initial: { assigned_to_id: IDS.employee } })
    const dialog = await drawer()
    const assignee = within(dialog).getByRole('combobox', { name: 'Assigned to' })
    await waitFor(() => expect(assignee.textContent).toContain('Dana Whitlock'))
    expect(assignee.hasAttribute('disabled')).toBe(false)
  })

  test('an employee sees Assigned to read-only as themselves', async () => {
    stubDrawerApi()
    mountDrawer({ viewer: EMPLOYEE })
    const dialog = await drawer()
    const assignee = within(dialog).getByRole('combobox', { name: 'Assigned to' })
    await waitFor(() => expect(assignee.textContent).toContain('Dana Whitlock'))
    expect(
      assignee.hasAttribute('disabled') || assignee.getAttribute('aria-disabled') === 'true'
    ).toBe(true)
  })
})

describe('Lots for a customer order', () => {
  test('an empty Lots section says the order can be created with no lots, and estimates $0.00', async () => {
    stubDrawerApi()
    mountDrawer({ initial: { customer_id: IDS.customer } })
    const dialog = await drawer()
    expect(within(dialog).getByRole('button', { name: /Add lot/ })).toBeTruthy()
    expect(await within(dialog).findByText(/Order estimate · 0 lots/)).toBeTruthy()
    expect(within(dialog).getByText('$0.00')).toBeTruthy()
  })

  test('each row shows its inputs, the premium prefilled from the rate, and the lot estimate from the preview', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    const dialog = await drawer()
    expect(await within(dialog).findByText('Lot 1')).toBeTruthy()
    expect(within(dialog).getByText('Lot 2')).toBeTruthy()
    for (const label of ['Metal', 'Unit', 'Purity']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeTruthy()
    }
    expect(within(dialog).getByRole('textbox', { name: 'Gross weight' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Product' })).toBeTruthy()
    expect(within(dialog).getByRole('textbox', { name: 'Quantity' })).toBeTruthy()

    const premiums = within(dialog).getAllByRole('textbox', {
      name: 'Premium (% of spot)',
    }) as HTMLInputElement[]
    await waitFor(() => expect(premiums.map((p) => p.value)).toEqual(['75', '98']))

    expect(within(dialog).getByText('$420.60')).toBeTruthy()
    expect(within(dialog).getByText('$23,645.44')).toBeTruthy()
    expect(within(dialog).getByText(/Lot estimate · 0\.232 t oz fine/)).toBeTruthy()
    expect(within(dialog).getByText(/Order estimate · 2 lots/)).toBeTruthy()
    expect(within(dialog).getByText('$24,066.04')).toBeTruthy()

    const sent = lastPreview(hits)
    expect(sent).toEqual({
      kind: 'customer_purchase',
      user_id: IDS.customer,
      lots: [
        { metal_id: 'Gold', pre_melt: 12.4, purity: 0.583, unit: 'g' },
        { bullion_id: IDS.eagle, quantity: 10 },
      ],
    })
  })

  test('editing a premium sends the override to the preview and shows what it returns, computing nothing', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    const dialog = await drawer()
    const [scrapPremium] = (await within(dialog).findAllByRole('textbox', {
      name: 'Premium (% of spot)',
    })) as HTMLInputElement[]
    await waitFor(() => expect(scrapPremium!.value).toBe('75'))
    fireEvent.change(scrapPremium!, { target: { value: '80' } })

    await waitFor(() =>
      expect(lastPreview(hits)).toMatchObject({
        lots: [{ premium: 0.8 }, { bullion_id: IDS.eagle }],
      })
    )
    expect(await within(dialog).findByText('$99,999.99')).toBeTruthy()
    expect(within(dialog).getByText('$11,111.11')).toBeTruthy()
    expect(within(dialog).queryByText('$24,066.04')).toBeNull()
  })

  test('the preview is read once per change, not per render', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    const dialog = await drawer()
    await within(dialog).findByText('$24,066.04')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(previews(hits)).toHaveLength(1)
  })

  test('Add lot, Duplicate and Remove change the rows and re-read the preview', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    const dialog = await drawer()
    await within(dialog).findByText('Lot 2')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate lot 1' }))
    expect(await within(dialog).findByText('Lot 3')).toBeTruthy()
    await waitFor(() => expect((lastPreview(hits)?.lots as unknown[]).length).toBe(3))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove lot 3' }))
    await waitFor(() => expect(within(dialog).queryByText('Lot 3')).toBeNull())

    fireEvent.click(within(dialog).getByRole('button', { name: /Add lot/ }))
    expect(await within(dialog).findByText('Lot 3')).toBeTruthy()
    expect(within(dialog).getAllByRole('radio', { name: 'Scrap' }).length).toBeGreaterThan(0)
  })

  test('the Scrap and Bullion toggle swaps a row between its two input sets', async () => {
    stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    const dialog = await drawer()
    await within(dialog).findByText('Lot 1')
    const [firstBullion] = within(dialog).getAllByRole('radio', { name: 'Bullion' })
    fireEvent.click(firstBullion!)
    await waitFor(() =>
      expect(within(dialog).getAllByRole('combobox', { name: 'Product' })).toHaveLength(2)
    )
    expect(within(dialog).queryByRole('textbox', { name: 'Gross weight' })).toBeNull()
  })

  test('a customer sale takes bullion rows', async () => {
    stubDrawerApi()
    mountDrawer({ initial: { ...emptyDrawerState('customer_sale'), customer_id: IDS.customer } })
    const dialog = await drawer()
    fireEvent.click(within(dialog).getByRole('button', { name: /Add lot/ }))
    expect(await within(dialog).findByRole('combobox', { name: 'Product' })).toBeTruthy()
  })
})

describe('Lots for refiner orders', () => {
  test('a Refiner Sale selects on-hand lots from a table filtered by metal, with the count', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: { ...emptyDrawerState('refiner_sale'), refiner_id: IDS.refiner } })
    const dialog = await drawer()
    expect(await within(dialog).findByText('On-hand lots')).toBeTruthy()
    expect(within(dialog).getByText('14 Karat Gold')).toBeTruthy()
    expect(within(dialog).getByText('Lot 2481-A')).toBeTruthy()
    expect(within(dialog).getByText('Sterling Silver')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /Add lot/ })).toBeNull()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /14 Karat Gold/ }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /18 Karat Gold/ }))
    expect(await within(dialog).findByText(/2 selected/)).toBeTruthy()
    await waitFor(() =>
      expect(lastPreview(hits)).toEqual({ kind: 'refiner_sale', lot_ids: [IDS.lotA, IDS.lotB] })
    )

    const metal = within(dialog).getByRole('combobox', { name: 'Metal' })
    fireEvent.keyDown(metal, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: 'Silver' }))
    await waitFor(() =>
      expect(
        hits.some(
          (hit) => hit.path === '/lots' && hit.url.searchParams.get('metal_id') === 'Silver'
        )
      ).toBe(true)
    )
    expect(hits.find((hit) => hit.path === '/lots')?.url.searchParams.get('position')).toBe(
      'on hand'
    )
  })

  test('a Refiner Sale with no on-hand lots shows the empty table', async () => {
    stubDrawerApi({ 'GET /lots': [] })
    mountDrawer({ initial: { ...emptyDrawerState('refiner_sale'), refiner_id: IDS.refiner } })
    const dialog = await drawer()
    expect(await within(dialog).findByText(/No on-hand lots/)).toBeTruthy()
  })

  test('a Refiner Purchase has no Lots section (ruling 159)', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: { ...emptyDrawerState('refiner_purchase'), refiner_id: IDS.refiner } })
    const dialog = await drawer()
    await within(dialog).findByRole('combobox', { name: 'Refiner' })
    expect(within(dialog).queryByText('Lots')).toBeNull()
    expect(within(dialog).queryByText('On-hand lots')).toBeNull()
    expect(previews(hits)).toHaveLength(0)
  })

  test('a refiner with an open sell order shows the conflict and holds Continue', async () => {
    stubDrawerApi({
      'GET /refining/orders': (url: URL) =>
        url.searchParams.get('refiner_id') === IDS.refiner &&
        url.searchParams.get('direction') === 'sell'
          ? {
              counts: { orders: 1, lots: 0 },
              items: [
                {
                  id: IDS.openSale,
                  number: 'RS-2493',
                  direction: 'sell',
                  refiner_id: IDS.refiner,
                  sent_at: null,
                  cancelled_at: null,
                  state: 'Draft',
                  actions: [],
                },
              ],
            }
          : { counts: { orders: 0, lots: 0 }, items: [] },
    })
    mountDrawer({ initial: { ...emptyDrawerState('refiner_sale'), refiner_id: IDS.refiner } })
    const dialog = await drawer()
    expect(
      await within(dialog).findByText('Asahi Refining already has an open sell order')
    ).toBeTruthy()
    expect(within(dialog).getByText(/RS-2493 is still open/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(
      true
    )
  })
})

describe('Continue on the Order step', () => {
  test('waits for a customer on a customer order', async () => {
    stubDrawerApi()
    mountDrawer()
    const dialog = await drawer()
    expect(within(dialog).getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(
      true
    )
    await pickCustomer()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Continue' }).hasAttribute('disabled')
      ).toBe(false)
    )
  })
})
