// The address book, rendered - list and card.
//
// jsdom, real components, real react-query, network mocked by URL. ONE READ
// now: the list used to fetch two endpoints and join them by address_id, and
// the pins here moved with it. What survives unchanged is the claim: the
// default sorts first and is bannered whatever the alphabet says.
//
// AND ONE NEW ONE. A card used to offer Edit and Remove on every address
// including the ones the API refuses with a 409; `actions` is the same rule
// the use case asserts on, so an address in use by an order shows neither.
import type { AddressBookEntry } from '@dorado/contracts'
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithClient } from '@/shared/tests/renderWithClient'
import React from 'react'

import AddressList from '../../addresses/ui/AddressList'

// "Work" is the default and comes first, which is what the server's sort
// promises; alphabetical alone would put Home first.
const entries = (): AddressBookEntry[] =>
  [
    {
      address: {
        id: 'a-work',
        line_1: '2 Oak Ave',
        line_2: '',
        city: 'Dallas',
        state: 'TX',
        zip: '75202',
        country: 'United States',
        country_code: 'US',
        phone_number: '5553334444',
        is_valid: true,
        is_residential: false,
      },
      user_address: {
        address_id: 'a-work',
        user_id: 'u-1',
        recipient_name: 'Ada Lovelace',
        label: 'Work',
        default_shipping: true,
      },
      actions: { edit: true, remove: true, set_default: false },
    },
    {
      address: {
        id: 'a-home',
        line_1: '1 Maple St',
        line_2: '',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        country: 'United States',
        country_code: 'US',
        phone_number: '5551112222',
        is_valid: true,
        is_residential: true,
      },
      user_address: {
        address_id: 'a-home',
        user_id: 'u-1',
        recipient_name: 'Grace Hopper',
        label: 'Home',
        default_shipping: false,
      },
      // IN USE BY AN UNFINISHED ORDER: the API would refuse both writes.
      actions: { edit: false, remove: false, set_default: true },
    },
  ] as unknown as AddressBookEntry[]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(String(input).includes('/addresses') ? entries() : {}),
    }))
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('the address book', () => {
  test('every entry renders by its recipient, default first and bannered', async () => {
    renderWithClient(<AddressList />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeDefined())
    expect(screen.getByText('Grace Hopper')).toBeDefined()
    expect(screen.getByText('Default')).toBeDefined()

    const names = [...document.querySelectorAll('h3')]
      .map((h) => h.textContent)
      .filter((t) => t === 'Ada Lovelace' || t === 'Grace Hopper')
    expect(names[0]).toBe('Ada Lovelace')
  })

  // A button that is shown is a call that is accepted.
  test('an address an order depends on offers neither Edit nor Remove', async () => {
    renderWithClient(<AddressList />)
    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeDefined())

    // One of the two entries may be edited, so exactly one of each button.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
    expect(screen.getByText('In use by an order in progress')).toBeDefined()
  })
})
