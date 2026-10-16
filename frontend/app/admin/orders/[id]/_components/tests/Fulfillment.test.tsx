import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Fulfillment, type FulfillmentChoice } from '../Fulfillment'
import { button } from './cardFixtures'

const choice: FulfillmentChoice = {
  methods: [{ value: 'drop', label: 'Drop ship to customer' }],
  methodId: 'drop',
  onMethodChange: () => {},
  shipTo: [{ value: 'a', label: 'Marguerite Whitfield' }],
  shipToId: 'a',
  onShipToChange: () => {},
  note: 'Sent with the order.',
}

describe('Fulfillment (209:3010)', () => {
  it('Empty: Not set, copy, and Create fulfillment fires', () => {
    const onCreate = vi.fn()
    const { container } = render(<Fulfillment onCreate={onCreate} />)
    expect(screen.getByText('Not set')).toBeTruthy()
    expect(screen.getByText('No fulfillment yet')).toBeTruthy()
    expect(screen.getByText(/to the office/)).toBeTruthy()
    fireEvent.click(button(container, 'Create fulfillment')!)
    expect(onCreate).toHaveBeenCalled()
  })

  it('sale copy names the customer', () => {
    render(<Fulfillment direction="sale" />)
    expect(screen.getByText(/to the customer/)).toBeTruthy()
  })

  it('Choose Method: two selects and the note', () => {
    render(<Fulfillment choice={choice} />)
    expect(screen.getByText('Fulfillment method')).toBeTruthy()
    expect(screen.getByText('Ship to')).toBeTruthy()
    expect(screen.getByText('Sent with the order.')).toBeTruthy()
    expect(screen.queryByText('No fulfillment yet')).toBeNull()
  })

  it('Loading and Error', () => {
    const { rerender } = render(<Fulfillment content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Fulfillment content="error" />)
    expect(screen.getByText('Check your connection, then try again.')).toBeTruthy()
  })

  it('mobile renders', () => {
    render(<Fulfillment layout="mobile" choice={choice} />)
    expect(screen.getByText('Ship to')).toBeTruthy()
  })
})
