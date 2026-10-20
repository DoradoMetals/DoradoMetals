import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/react'

import { emptyDrawerState } from '../../_lib/createOrder'
import {
  IDS,
  desktop,
  drawer,
  mountDrawer,
  next,
  purchaseState,
  stubDrawerApi,
} from './createOrderFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => desktop(true))
afterEach(() => vi.unstubAllGlobals())

const isDisabled = (el: HTMLElement) =>
  el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'

async function toFulfillment(initial = purchaseState()) {
  const hits = stubDrawerApi()
  mountDrawer({ initial })
  await next()
  const dialog = await drawer()
  return { hits, dialog }
}

describe('Fulfillment for a customer purchase', () => {
  test('asks how the metal comes in with three method tiles and a Decide later tile', async () => {
    const { dialog } = await toFulfillment()
    expect(await within(dialog).findByText('How does the metal come in?')).toBeTruthy()
    for (const name of ['Shipment', 'Dorado pickup', 'Appointment', 'Decide later']) {
      expect(within(dialog).getByRole('radio', { name: new RegExp(name) })).toBeTruthy()
    }
    expect(
      within(dialog).getByText(/Our courier collects at the customer.s address\./)
    ).toBeTruthy()
  })

  test('Decide later is disabled when the order has lots', async () => {
    const { dialog } = await toFulfillment()
    const later = await within(dialog).findByRole('radio', { name: /Decide later/ })
    expect(isDisabled(later)).toBe(true)
    expect(within(dialog).getByText('Set it on the order screen once lots are added.')).toBeTruthy()
  })

  test('Decide later is open when the order has no lots, and hides every detail field', async () => {
    const { dialog } = await toFulfillment(purchaseState({ lots: [] }))
    const later = await within(dialog).findByRole('radio', { name: /Decide later/ })
    expect(isDisabled(later)).toBe(false)
    fireEvent.click(later)
    await waitFor(() => expect(within(dialog).queryByText('Shipment details')).toBeNull())
    expect(within(dialog).getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(
      false
    )
  })

  test('Shipment shows the handoff chips, service, package, addresses, coverage and a read-only declared value', async () => {
    const { dialog } = await toFulfillment()
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Shipment/ }))
    expect(await within(dialog).findByText('Shipment details')).toBeTruthy()
    for (const chip of ['Carrier drop-off', 'Carrier pickup', 'Own label']) {
      expect(within(dialog).getByRole('radio', { name: chip })).toBeTruthy()
    }
    for (const label of ['Service', 'Package size', 'Ship to', 'Ship from', 'Coverage']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeTruthy()
    }
    expect(within(dialog).getByText('Declared value')).toBeTruthy()
    expect(await within(dialog).findByText('$24,066.04')).toBeTruthy()
    expect(within(dialog).queryByRole('textbox', { name: 'Declared value' })).toBeNull()
  })

  test('Carrier pickup adds the pickup date and the pickup window', async () => {
    const { dialog } = await toFulfillment()
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Shipment/ }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'Carrier pickup' }))
    expect(await within(dialog).findByRole('grid')).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Pickup window' })).toBeTruthy()
  })

  test('Own label hides the label fields: no service, package, coverage or declared value', async () => {
    const { dialog } = await toFulfillment()
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Shipment/ }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'Own label' }))
    await waitFor(() =>
      expect(within(dialog).queryByRole('combobox', { name: 'Service' })).toBeNull()
    )
    expect(within(dialog).queryByRole('combobox', { name: 'Package size' })).toBeNull()
    expect(within(dialog).queryByRole('combobox', { name: 'Coverage' })).toBeNull()
    expect(within(dialog).queryByText('Declared value')).toBeNull()
    expect(within(dialog).getByRole('combobox', { name: 'Ship to' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Ship from' })).toBeTruthy()
  })

  test('Dorado pickup asks for driver, destination, pickup address, date and window', async () => {
    const { dialog } = await toFulfillment()
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Dorado pickup/ }))
    expect(await within(dialog).findByText('Pickup details')).toBeTruthy()
    for (const label of ['Driver', 'Bring to', 'Pickup address', 'Window']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeTruthy()
    }
    expect(within(dialog).getByRole('grid')).toBeTruthy()
  })

  test('Appointment offers Scheduled or Walk in, then office, staff, date and time', async () => {
    const { dialog } = await toFulfillment()
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Appointment/ }))
    expect(await within(dialog).findByText('Appointment details')).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'Scheduled' })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'Walk in' })).toBeTruthy()
    for (const label of ['Office', 'With', 'Time']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeTruthy()
    }
  })

  test('the methods come from the admin methods read for the order direction', async () => {
    const { hits, dialog } = await toFulfillment()
    await within(dialog).findByText('How does the metal come in?')
    const read = hits.find((hit) => hit.path === '/fulfillments/methods')
    expect(read?.url.searchParams.get('direction')).toBe('purchase')
  })
})

describe('Fulfillment for a customer sale', () => {
  test('asks how the metal goes out: Shipment with Dropship, or Appointment', async () => {
    const { dialog, hits } = await toFulfillment({
      ...emptyDrawerState('customer_sale'),
      customer_id: IDS.customer,
      lots: purchaseState().lots!.slice(1),
    })
    expect(await within(dialog).findByText('How does the metal go out?')).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: /Shipment/ })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: /Appointment/ })).toBeTruthy()
    expect(within(dialog).queryByRole('radio', { name: /Dorado pickup/ })).toBeNull()
    expect(
      hits.find((hit) => hit.path === '/fulfillments/methods')?.url.searchParams.get('direction')
    ).toBe('sale')
  })
})

describe('Fulfillment for a Refiner Sale', () => {
  test('asks how the lots reach the refiner, Drop-off with driver, from, refinery, date and window', async () => {
    const { dialog, hits } = await toFulfillment({
      ...emptyDrawerState('refiner_sale'),
      refiner_id: IDS.refiner,
      settlement_type: 'pooled',
      location_id: IDS.austin,
      lot_ids: [IDS.lotA],
    })
    expect(await within(dialog).findByText('How do the lots reach the refiner?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Drop-off/ }))
    expect(await within(dialog).findByText('Drop-off details')).toBeTruthy()
    for (const label of ['Driver', 'From', 'Refinery', 'Window']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeTruthy()
    }
    expect(hits.some((hit) => hit.path === '/fulfillments/methods/refiner')).toBe(true)
  })
})
