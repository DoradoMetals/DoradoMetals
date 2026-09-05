// The two catalogue cards, rendered - the buy side and the sell side.
//
// Same rules as media and spots: jsdom, real component tree, real query cache,
// real quote hook, with the network boundary and the heavy presentation
// libraries (next/image, NumberFlow) shimmed. What is pinned survives
// the quotes conversion: the card shows the product's name, its price is the
// SERVER'S QUOTED unit_price for the side it is for (ask to buy, bid to sell)
// and never a client computation, and add-to-cart puts the product in the right
// BASKET keyed so a second add increments rather than duplicates.
//
// THE BASKET IS THE SERVER'S NOW (ruling 63). There is no zustand store to read
// after a click: `stubCheckoutServer` stands in for /checkout/items, so the
// hooks, the cache and the line arithmetic under the button are all the real
// ones and the assertion is about the rows the API was told to hold.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithClient } from '@/shared/tests/renderWithClient'
import userEvent from '@testing-library/user-event'
import React from 'react'

// The spot feed moved into @dorado/client, which talks to the platform's
// `fetch` rather than the axios wrapper this file stubs. Mocked with the same
// row the URL branch answered, so the cards' popover still has a spot to read
// - without this the branch would simply stop firing and the file would keep
// passing while exercising less.
vi.mock('@dorado/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSpotPrices: () => ({ data: liveSpots(), isSuccess: true }),
}))
vi.mock('@/shared/hooks/auth/queries', () => ({ useGetSession: () => ({ user: null }) }))
// A visitor has a session too - an anonymous one (ruling 63) - so the basket
// reads are enabled exactly as they are for a customer.
vi.mock('@/shared/hooks/auth/authClient', () => ({
  useUser: () => ({ user: { id: 'visitor-1' }, session: null, error: null, isPending: false }),
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { src: props.src, alt: String(props.alt ?? '') }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@number-flow/react', () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => React.createElement('span', null, String(value)),
  NumberFlowGroup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
}))
vi.mock('@dorado/components', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value, className }: { value: number; className?: string }) =>
    React.createElement('span', { className }, String(value)),
}))

import { stubCheckoutServer, type CheckoutServer } from '@/shared/tests/checkoutServer'
import ProductCard from '@/app/buy/_src_/products/ui/ProductCard'
import BullionCard from '@/app/sell/_src_/products/ui/BullionCard'
import type { Product } from '@/shared/types/products'

// One gold eagle, in the CURRENT wire shape. The card's price comes from the
// quote, so the product's own bid/ask premium columns exist only to feed the
// accidental client math this file guards against.
const eagle = (): Product =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Gold American Eagle',
    description: 'One ounce of gold',
    type: 'Coin',
    content: 1,
    purity: 0.9167,
    gross: 1.0909,
    bid_premium: 0.5,
    ask_premium: 1.5,
    image_front: 'https://img/front.png',
    image_back: 'https://img/back.png',
    mint_name: 'US Mint',
    metal_type: 'Gold',
    metal_id: '00000000-0000-4000-8000-00000000000a',
    mint_id: '00000000-0000-4000-8000-00000000000b',
    variant_group: '',
    shadow_offset: 0,
    slug: 'gold-american-eagle',
    is_generic: false,
    variant_label: '',
    legal_tender: true,
    domestic_tender: true,
  }) as Product

// The spot the card keys by METAL ID off the product row.
const liveSpots = () => [
  {
    id: '00000000-0000-4000-8000-00000000000a',
    name: 'Gold',
    ask: 3000,
    bid: 2900,
    dollar_change: 1,
    percent_change: 0.1,
    direction: 'up',
  },
]

// The quoted unit prices are DELIBERATELY not what the client math would
// compute from the fixture spots (content * 3000 * 1.5 = 4500 ask,
// content * 2900 * 0.5 = 1450 bid): a card showing 4501.25 or 1449.75 can
// only have read the quote, never multiplied a bid/ask premium itself.
const quotedProduct = (bullion_id: string, side: 'ask' | 'bid') => {
  const unit_price = side === 'ask' ? 4501.25 : 1449.75
  return {
    bullion_id,
    side,
    spots_at: '2026-08-27T00:00:00.000Z',
    quantity: 1,
    metal_id: 'Gold',
    content: 1,
    premium: side === 'ask' ? 1.25 : -0.25,
    unit_price,
    line_total: unit_price,
  }
}

// THE CLIENT PACKAGE TALKS TO `fetch`, NOT TO THIS APP'S AXIOS WRAPPER - the
// quote hook moved into @dorado/client. `stubCheckoutServer` already owns
// `fetch` for the basket; this layers the quote branch on top of it and
// forwards everything else, the same URL-discrimination the old axios mock
// did (the spot ticker and the quote surface are different endpoints
// answering different questions, and the quote answers by side).
beforeEach(() => {
  localStorage.clear()
  checkout = stubCheckoutServer()
  const checkoutFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input), 'http://test.local')
      if (url.pathname.endsWith('/quotes/catalog')) {
        const { bullion_id, side } = JSON.parse(String(init?.body ?? '{}')) as {
          bullion_id: string
          side: 'ask' | 'bid'
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(quotedProduct(bullion_id, side)),
        } as unknown as Response
      }
      return checkoutFetch(input as unknown as RequestInfo, init)
    })
  )
})

let checkout: CheckoutServer

// EACH CARD QUOTES ITSELF. The page used to batch one catalog quote for the
// whole grid and hand each card its price out of a map; the quote surface
// prices ONE product now, so the card asks for its own selected variant.

describe('the buy card', () => {
  test('shows the product and prices it at the quoted ask unit_price', async () => {
    renderWithClient(<ProductCard product={eagle()} variants={[]} />)
    expect(screen.getAllByText('Gold American Eagle').length).toBeGreaterThan(0)
    // The server's number, not content * ask * premium (which would be 4500).
    await waitFor(() => expect(screen.getAllByText('4501.25').length).toBeGreaterThan(0))
  })

  test('add to checkout puts the product in the sale basket, and a second add increments', async () => {
    const { container } = renderWithClient(<ProductCard product={eagle()} variants={[]} />)
    // The whole card is role="button" and its accessible name contains every
    // word on it - anchor the match so it can only be the real control.
    await userEvent.click(screen.getByRole('button', { name: /^add to checkout$/i }))
    await waitFor(() => expect(checkout.lines('sale')).toHaveLength(1))
    expect(checkout.lines('sale')[0].quantity).toBe(1)

    // With one in the basket the labelled button becomes -/+ steppers; the
    // plus is icon-only, so it is found by its lucide class.
    const plus = [...container.querySelectorAll('button')].find((b) =>
      b.querySelector('svg.lucide-plus')
    )
    expect(plus).toBeTruthy()
    await userEvent.click(plus as HTMLElement)
    await waitFor(() => expect(checkout.lines('sale')[0].quantity).toBe(2))
    expect(checkout.lines('sale')).toHaveLength(1)
  })
})

describe('the sell card', () => {
  test('shows the product and prices it at the quoted bid unit_price', async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} />)
    expect(screen.getAllByText('Gold American Eagle').length).toBeGreaterThan(0)
    // The server's number, not content * bid * premium (which would be 1450).
    await waitFor(() => expect(screen.getAllByText('1449.75').length).toBeGreaterThan(0))
  })

  test('add to the purchase basket stores a line naming the product', async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /^sell to us$/i }))
    await waitFor(() => expect(checkout.lines('purchase')).toHaveLength(1))
    const items = checkout.lines('purchase')
    expect('bullion_id' in items[0] && items[0].bullion_id).toBe(eagle().id)
    // A bullion line names an id and a quantity and nothing else: the API
    // refuses one that spells its own weights (ruling 43), so toNewCheckoutItem
    // strips the snapshot the card carries for its own rendering.
    expect('pre_melt' in items[0]).toBe(false)
    expect('purity' in items[0]).toBe(false)
  })
})
