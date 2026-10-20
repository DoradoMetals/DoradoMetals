import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { emptyDrawerState, type DrawerState } from '../../_lib/createOrder'
import {
  IDS,
  PENDING,
  VERIFIED,
  desktop,
  drawer,
  mountDrawer,
  next,
  purchaseState,
  stubDrawerApi,
  type Routes,
} from './createOrderFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => desktop(true))
afterEach(() => vi.unstubAllGlobals())

const pickup = {
  method_id: IDS.doradoPickup,
  choices: {
    pickup: {
      pickup_address_id: IDS.home,
      location_id: IDS.keller,
      assigned_employee_id: IDS.employee,
      start_time: '2026-06-18T18:00:00.000Z',
    },
  },
}

const continueButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: 'Continue' })

async function toTransaction(initial: Partial<DrawerState>, routes: Routes = {}) {
  const hits = stubDrawerApi(routes)
  mountDrawer({ initial })
  await next()
  await next()
  const dialog = await drawer()
  return { hits, dialog }
}

describe('Transaction for a customer purchase', () => {
  test('asks how we pay them with ACH, eCheck, Wire, Dorado balance and an open Decide later', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }))
    expect(await within(dialog).findByText('How do we pay them?')).toBeTruthy()
    for (const name of ['ACH', 'eCheck', 'Wire', 'Dorado balance']) {
      expect(within(dialog).getByRole('radio', { name: new RegExp(name) })).toBeTruthy()
    }
    const later = within(dialog).getByRole('radio', { name: /Decide later/ })
    expect(later.hasAttribute('disabled') || later.getAttribute('aria-disabled') === 'true').toBe(
      false
    )
  })

  test('ACH lists the linked accounts with a Verified badge and offers Link a new account', async () => {
    const { dialog, hits } = await toTransaction(purchaseState({ fulfillment: pickup }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    expect(await within(dialog).findByText('Accounts')).toBeTruthy()
    const payoutTo = within(dialog).getByRole('combobox', { name: 'Payout to' })
    await waitFor(() =>
      expect(payoutTo.textContent).toContain('Chase · Marguerite Whitfield · ···· 4417')
    )
    expect(within(dialog).getByText('Verified')).toBeTruthy()
    expect(hits.some((hit) => hit.path === `/accounts/${IDS.customer}/bank-links`)).toBe(true)

    fireEvent.keyDown(payoutTo, { key: 'Enter' })
    expect(await screen.findByRole('option', { name: 'Link a new account' })).toBeTruthy()
    fireEvent.keyDown(await screen.findByRole('listbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(false)
  })

  test('no field anywhere takes a routing or account number (ruling 160)', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    await within(dialog).findByText('Accounts')
    expect(within(dialog).queryByLabelText(/routing/i)).toBeNull()
    expect(within(dialog).queryByLabelText(/account number/i)).toBeNull()
  })

  test('a pending account shows the Pending badge and holds Continue', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }), {
      [`GET /accounts/${IDS.customer}/bank-links`]: [PENDING],
    })
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    expect(await within(dialog).findByText('Pending')).toBeTruthy()
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(true)
  })

  test('with no account the Send link block sends by SMS to the phone on file, then waits for the webhook', async () => {
    let linked: unknown[] = []
    const { dialog, hits } = await toTransaction(
      purchaseState({ customer_id: IDS.bare, fulfillment: pickup }),
      {
        [`GET /users/${IDS.bare}`]: {
          id: IDS.bare,
          name: 'Ada Bare',
          email: 'ada@bare.me',
          phone_number: '+15125550117',
        },
        [`GET /accounts/${IDS.bare}/bank-links`]: () => linked,
        [`POST /accounts/${IDS.bare}/bank-links`]: () => {
          linked = [{ ...PENDING, user_id: IDS.bare }]
          return { status: 201, body: linked[0] }
        },
        [`POST /accounts/${IDS.bare}/bank-links/${IDS.pendingLink}/resend`]: () => linked[0],
      }
    )
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    expect(await within(dialog).findByText('No linked bank account')).toBeTruthy()
    expect(within(dialog).getByText('The customer completes the link on their phone.')).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'SMS' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(within(dialog).getByRole('radio', { name: 'Email' })).toBeTruthy()
    expect((within(dialog).getByRole('textbox', { name: 'To' }) as HTMLInputElement).value).toBe(
      '(512) 555-0117'
    )
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send link' }))
    await waitFor(() =>
      expect(
        hits.find((hit) => hit.method === 'POST' && hit.path === `/accounts/${IDS.bare}/bank-links`)
          ?.body
      ).toEqual({ channel: 'sms' })
    )
    expect(await within(dialog).findByText('Pending')).toBeTruthy()
    expect(within(dialog).getByText(/^Sent by SMS/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Resend' })).toBeTruthy()
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resend' }))
    await waitFor(() => expect(hits.some((hit) => hit.path.endsWith('/resend'))).toBe(true))

    linked = [{ ...VERIFIED, user_id: IDS.bare }]
    await waitFor(() => expect(continueButton(dialog).hasAttribute('disabled')).toBe(false), {
      timeout: 15_000,
    })
    expect(within(dialog).getByText('Verified')).toBeTruthy()
  }, 20_000)

  test('a link Plaid refused shows Could not send with Resend, and Continue stays closed', async () => {
    const { dialog } = await toTransaction(
      purchaseState({ customer_id: IDS.bare, fulfillment: pickup }),
      {
        [`GET /accounts/${IDS.bare}/bank-links`]: [
          { ...PENDING, user_id: IDS.bare, status: 'errored' },
        ],
      }
    )
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    expect(await within(dialog).findByText('Could not send')).toBeTruthy()
    expect(within(dialog).getByText(/^Could not send by SMS/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Resend' })).toBeTruthy()
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(true)
  })

  test('Email sends to the email on file', async () => {
    const { dialog, hits } = await toTransaction(
      purchaseState({ customer_id: IDS.bare, fulfillment: pickup }),
      {
        [`POST /accounts/${IDS.bare}/bank-links`]: {
          status: 201,
          body: { ...PENDING, channel: 'email' },
        },
      }
    )
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    await within(dialog).findByText('No linked bank account')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Email' }))
    expect((within(dialog).getByRole('textbox', { name: 'To' }) as HTMLInputElement).value).toBe(
      'marguerite@whitfield.me'
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send link' }))
    await waitFor(() =>
      expect(
        hits.find((hit) => hit.method === 'POST' && hit.path.endsWith('/bank-links'))?.body
      ).toEqual({
        channel: 'email',
      })
    )
  })

  test('Link a new account opens the Send link block even when accounts exist', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /ACH/ }))
    const payoutTo = await within(dialog).findByRole('combobox', { name: 'Payout to' })
    fireEvent.keyDown(payoutTo, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: 'Link a new account' }))
    expect(await within(dialog).findByRole('button', { name: 'Send link' })).toBeTruthy()
  })

  test('eCheck pays to the email on file with no account to pick', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /eCheck/ }))
    expect(await within(dialog).findByText('marguerite@whitfield.me · email on file')).toBeTruthy()
    expect(within(dialog).queryByRole('combobox', { name: 'Payout to' })).toBeNull()
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(false)
  })

  test('Dorado balance needs no accounts', async () => {
    const { dialog } = await toTransaction(purchaseState({ fulfillment: pickup }))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Dorado balance/ }))
    await waitFor(() => expect(within(dialog).queryByText('Accounts')).toBeNull())
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(false)
  })

  test('Decide later is open for an order with no lots', async () => {
    const { dialog } = await toTransaction(purchaseState({ lots: [], fulfillment: 'later' }))
    const later = await within(dialog).findByRole('radio', { name: /Decide later/ })
    expect(later.hasAttribute('disabled') || later.getAttribute('aria-disabled') === 'true').toBe(
      false
    )
  })
})

describe('Transaction for a customer sale', () => {
  test('asks for the payment method and the billing address', async () => {
    const { dialog, hits } = await toTransaction({
      ...emptyDrawerState('customer_sale'),
      customer_id: IDS.customer,
      lots: purchaseState().lots!.slice(1),
      fulfillment: {
        method_id: IDS.dropship,
        choices: { shipment: { carrier_service_id: IDS.service, recipient_address_id: IDS.home } },
      },
    })
    expect(await within(dialog).findByRole('combobox', { name: 'Payment method' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Billing address' })).toBeTruthy()
    expect(
      hits.find((hit) => hit.path === '/payments/methods')?.url.searchParams.get('direction')
    ).toBe('sale')
  })
})

describe('Transaction for a refiner order', () => {
  test('says settlement comes later and lets the order continue', async () => {
    const { dialog } = await toTransaction({
      ...emptyDrawerState('refiner_sale'),
      refiner_id: IDS.refiner,
      settlement_type: 'pooled',
      location_id: IDS.austin,
      lot_ids: [],
      fulfillment: 'later',
    })
    expect(await within(dialog).findByText('Settlement comes later')).toBeTruthy()
    expect(continueButton(dialog).hasAttribute('disabled')).toBe(false)
  })
})
