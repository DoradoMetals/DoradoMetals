import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/react'

import {
  IDS,
  desktop,
  drawer,
  mountDrawer,
  next,
  pickCustomer,
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

const button = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name })

const footerOf = (dialog: HTMLElement) =>
  button(dialog, 'Cancel').closest('[class*="mt-auto"]') as HTMLElement

describe('the footer (rulings 163 and 164)', () => {
  test('Cancel sits first at the left; Back, Skip and Continue follow at the right', async () => {
    stubDrawerApi()
    mountDrawer({ initial: purchaseState() })
    await next()
    const dialog = await drawer()
    const names = within(footerOf(dialog))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['Cancel', 'Back', 'Skip', 'Continue'])
  })

  test('Skip on the Order step waits for the party, then continues with no lots', async () => {
    const hits = stubDrawerApi()
    mountDrawer({
      initial: { ...purchaseState(), customer_id: null },
    })
    const dialog = await drawer()
    expect(button(dialog, 'Skip').hasAttribute('disabled')).toBe(true)
    await pickCustomer()
    await waitFor(() => expect(button(dialog, 'Skip').hasAttribute('disabled')).toBe(false))
    fireEvent.click(button(dialog, 'Skip'))
    expect(await within(dialog).findByText('How does the metal come in?')).toBeTruthy()
    const later = await within(dialog).findByRole('radio', { name: /Decide later/ })
    expect(later.hasAttribute('disabled') || later.getAttribute('aria-disabled') === 'true').toBe(
      false
    )
    expect(writes(hits)).toEqual([])
  })

  test('Skip on Fulfillment and Transaction sets Decide later, and Review has no Skip', async () => {
    const hits = stubDrawerApi()
    mountDrawer({ initial: purchaseState({ lots: [], assigned_to_id: IDS.owner }) })
    await next()
    const dialog = await drawer()
    fireEvent.click(button(dialog, 'Skip'))
    expect(await within(dialog).findByText('How do we pay them?')).toBeTruthy()
    fireEvent.click(button(dialog, 'Skip'))
    expect(await within(dialog).findByRole('heading', { name: 'Review' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Skip' })).toBeNull()
    fireEvent.click(button(dialog, 'Create order'))
    await waitFor(() =>
      expect(
        hits.find((hit) => hit.method === 'POST' && hit.path === '/orders/admin')?.body
      ).toEqual({
        direction: 'purchase',
        user_id: IDS.customer,
        assigned_to_id: IDS.owner,
        lots: [],
      })
    )
  })

  test('with lots, Skip on Fulfillment is enabled for a purchase and disabled for a sale', async () => {
    stubDrawerApi()
    const purchase = mountDrawer({ initial: purchaseState() })
    await next()
    expect(button(await drawer(), 'Skip').hasAttribute('disabled')).toBe(false)
    purchase.unmount()

    mountDrawer({
      initial: purchaseState({ kind: 'customer_sale', lots: purchaseState().lots!.slice(1) }),
    })
    await next()
    expect(button(await drawer(), 'Skip').hasAttribute('disabled')).toBe(true)
  })

  test('a refusal shows as a Danger alert floating above the footer buttons, out of the footer layout flow', async () => {
    stubDrawerApi({
      'POST /orders/admin': { status: 422, body: { error: { message: 'Customer is closed.' } } },
    })
    mountDrawer({ initial: purchaseState({ lots: [], fulfillment: 'later', payout: 'later' }) })
    await next()
    await next()
    await next()
    const dialog = await drawer()
    const footer = footerOf(dialog)
    const inFlow = () =>
      Array.from(footer.children).filter(
        (child) => !(child as HTMLElement).className.split(' ').includes('absolute')
      )
    const before = inFlow()
    fireEvent.click(button(dialog, 'Create order'))
    const alert = await within(dialog).findByRole('alert')
    expect(footer.className.split(' ')).toContain('relative')
    const wrapper = alert.closest('[data-drawer-footer-alert]') as HTMLElement
    expect(wrapper.parentElement).toBe(footer)
    expect(wrapper.className.split(' ')).toEqual(
      expect.arrayContaining(['absolute', 'bottom-full', 'inset-x-md'])
    )
    expect(inFlow()).toEqual(before)
    expect(inFlow()).not.toContain(wrapper)
    expect(document.activeElement).toBe(alert)
    expect(footer.contains(alert)).toBe(true)
    expect(
      alert.compareDocumentPosition(button(dialog, 'Create order')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
