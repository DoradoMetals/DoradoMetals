import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Payment, type PaymentProps } from '../Payment'
import { button, payment, payout } from './cardFixtures'

const methods = [
  { value: 'ACH', label: 'ACH Transfer' },
  { value: 'DORADO_ACCOUNT', label: 'Dorado balance' },
  { value: 'ECHECK', label: 'eCheck' },
]
const bank = [{ value: 'bank-1', label: 'Chase · Checking •••• 4417' }]
const send = { name: 'send_payment', confirm: null, override: null }

function draw(over: Partial<PaymentProps> = {}) {
  const onAction = vi.fn()
  const props: PaymentProps = {
    payment: payment(),
    payout: payout(),
    methods,
    lines: [{ key: 'one', method: 'ACH', payTo: bank, payToId: 'bank-1' }],
    actions: [send],
    onAction,
    onAddLine: vi.fn(),
    ...over,
  }
  const utils = render(<Payment {...props} />)
  return { ...utils, onAction, props }
}

describe('Payment (170:2316 / 170:2477)', () => {
  it('Not sent, one method: payout facts, Method, Pay to, Send payment, Add payout method; no amount field', () => {
    const { container, onAction } = draw()
    expect(screen.getByText('Not sent')).toBeTruthy()
    for (const text of [
      'Marguerite Whitfield',
      'Chase',
      'Checking',
      '•••• 5679',
      '•••• 4417',
      '$13,346.09',
    ])
      expect(screen.getByText(text)).toBeTruthy()
    expect(screen.getByText('Method')).toBeTruthy()
    expect(screen.getByText('Pay to')).toBeTruthy()
    expect(screen.queryByLabelText('Amount')).toBeNull()
    expect(button(container, 'Add payout method')).toBeTruthy()
    fireEvent.click(button(container, 'Send payment')!)
    expect(onAction).toHaveBeenCalledWith(send)
  })

  it('Open=False collapses to the title row and badge', () => {
    draw({ open: false, onOpenChange: () => {} })
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.queryByText('Account name')).toBeNull()
  })

  it('Processing and Sent draw a disabled status button when send_payment is not offered', () => {
    const { container, rerender, props } = draw({
      payment: payment({ state: 'Processing' }),
      actions: [],
    })
    expect(button(container, 'Processing…')!.disabled).toBe(true)
    expect(button(container, 'Add payout method')).toBeUndefined()
    rerender(<Payment {...props} payment={payment({ state: 'Sent' })} actions={[]} />)
    expect(screen.getByText('Sent')).toBeTruthy()
    expect(button(container, 'Payment sent')!.disabled).toBe(true)
  })

  it('Due and Received (sale): Method only, Request payment from actions, then Payment received', () => {
    const request = { name: 'request_payment', confirm: null, override: null }
    const { container, rerender, props, onAction } = draw({
      payment: payment({ direction: 'sale', kind: 'charge', state: 'Due' }),
      lines: [{ key: 'one', method: 'ACH' }],
      actions: [request],
    })
    expect(screen.getByText('Due')).toBeTruthy()
    expect(screen.queryByText('Pay to')).toBeNull()
    expect(button(container, 'Add payout method')).toBeUndefined()
    fireEvent.click(button(container, 'Request payment')!)
    expect(onAction).toHaveBeenCalledWith(request)
    rerender(
      <Payment
        {...props}
        payment={payment({ direction: 'sale', state: 'Received' })}
        actions={[]}
      />
    )
    expect(button(container, 'Payment received')!.disabled).toBe(true)
  })

  it('Matching: search unmatched transactions and Confirm match', () => {
    const match = { name: 'confirm_match', confirm: null, override: null }
    const { container, onAction } = draw({
      payment: payment({ direction: 'sale', state: 'Due' }),
      actions: [match],
      matching: {
        query: '',
        onQueryChange: () => {},
        candidates: [{ id: 'm1', label: 'Sep 5 · Wire · $14,120.00 · ELEMETAL' }],
        selectedId: 'm1',
        onSelect: () => {},
      },
    })
    expect(screen.getByPlaceholderText('Search unmatched transactions…')).toBeTruthy()
    fireEvent.click(button(container, 'Confirm match')!)
    expect(onAction).toHaveBeenCalledWith(match)
  })

  it('Methods=Two: each line carries an amount; Add payout method sits beside Send payment', () => {
    const onLineChange = vi.fn()
    const { container } = draw({
      lines: [
        {
          key: 'a',
          method: 'DORADO_ACCOUNT',
          payTo: [{ value: 'credit', label: 'Marguerite Whitfield · credit balance' }],
          payToId: 'credit',
          amount: '2,000.00',
        },
        { key: 'b', method: 'ECHECK', payTo: bank, payToId: 'bank-1', amount: '11,346.09' },
      ],
      onLineChange,
    })
    const amounts = screen.getAllByLabelText('Amount') as HTMLInputElement[]
    expect(amounts.map((input) => input.value)).toEqual(['2,000.00', '11,346.09'])
    expect(container.querySelectorAll('[data-line]').length).toBe(2)
    fireEvent.change(amounts[1], { target: { value: '11,000.00' } })
    expect(onLineChange).toHaveBeenCalledWith(1, { amount: '11,000.00' })
    expect(button(container, 'Add payout method')).toBeTruthy()
    expect(button(container, 'Send payment')).toBeTruthy()
  })

  it('Add payout method calls onAddLine', () => {
    const { container, props } = draw()
    fireEvent.click(button(container, 'Add payout method')!)
    expect(props.onAddLine).toHaveBeenCalled()
  })

  it('Content=Empty, Loading and Error', () => {
    const onRetry = vi.fn()
    const { rerender, props, container } = draw({ content: 'empty' })
    expect(screen.getByText('No payout account yet')).toBeTruthy()
    rerender(<Payment {...props} content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Not sent')).toBeTruthy()
    rerender(<Payment {...props} content="error" onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t load payment')).toBeTruthy()
    fireEvent.click(button(container, 'Try again')!)
    expect(onRetry).toHaveBeenCalled()
  })

  it('Failed: danger badge, the bank reason, Retry payout', () => {
    const { container } = draw({
      payment: payment({ state: 'Failed', failure_reason: 'Account closed (R02).' }),
    })
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('The bank returned this payout')).toBeTruthy()
    expect(screen.getByText('Account closed (R02).')).toBeTruthy()
    expect(button(container, 'Retry payout')).toBeTruthy()
  })

  it('Dorado balance: info alert, no bank facts, no Pay to, Credit balance from add_funds', () => {
    const addFunds = { name: 'add_funds', confirm: null, override: null }
    const { container, onAction } = draw({
      lines: [{ key: 'one', method: 'DORADO_ACCOUNT', payTo: bank }],
      actions: [addFunds],
    })
    expect(screen.getByText('Paid to the customer’s Dorado balance')).toBeTruthy()
    expect(screen.queryByText('Bank')).toBeNull()
    expect(screen.queryByText('Pay to')).toBeNull()
    expect(button(container, 'Add payout method')).toBeUndefined()
    fireEvent.click(button(container, 'Credit balance')!)
    expect(onAction).toHaveBeenCalledWith(addFunds)
  })

  it('No bank linked: warning, Link bank account, Send payment disabled when not offered', () => {
    const onLinkBank = vi.fn()
    const { container } = draw({
      lines: [{ key: 'one', method: 'ACH', payTo: [] }],
      actions: [],
      onLinkBank,
    })
    expect(screen.getByText('No bank account linked')).toBeTruthy()
    expect(screen.queryByText('Routing')).toBeNull()
    fireEvent.click(button(container, 'Link bank account')!)
    expect(onLinkBank).toHaveBeenCalled()
    expect(button(container, 'Send payment')!.disabled).toBe(true)
  })

  it('Card declined (sale card): Declined badge, card brand and last 4 with the reason', () => {
    draw({
      payment: payment({
        direction: 'sale',
        rail: 'CARD',
        state: 'Failed',
        card_brand: 'Visa',
        card_last4: '4242',
        failure_reason: 'insufficient funds',
      }),
      lines: [{ key: 'one', method: 'CARD' }],
      actions: [],
    })
    expect(screen.getByText('Declined')).toBeTruthy()
    expect(screen.getByText('Card declined')).toBeTruthy()
    expect(screen.getByText('Visa •••• 4242: insufficient funds')).toBeTruthy()
  })

  it('Card received (sale card, no transfer row): Received badge and the card', () => {
    draw({
      payment: payment({
        direction: 'sale',
        transfer_id: null,
        rail: 'CARD',
        state: 'Received',
        intent_status: 'succeeded',
        card_brand: 'visa',
        card_last4: '4242',
      }),
      lines: [{ key: 'one', method: 'CARD' }],
      actions: [],
    })
    expect(screen.getAllByText('Received').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not sent')).toBeNull()
    expect(screen.queryByText('Declined')).toBeNull()
    expect(screen.getByText('visa •••• 4242')).toBeTruthy()
  })

  it('Partially refunded: badge and a Refunded fact', () => {
    draw({
      payment: payment({ direction: 'sale', state: 'Received' }),
      paymentFacts: {
        received: 14120,
        refunded: 1105.2,
        refundable: 13014.8,
        credit: 0,
        charge_received: true,
      },
      lines: [{ key: 'one', method: 'ACH' }],
      actions: [],
    })
    expect(screen.getByText('Partially refunded')).toBeTruthy()
    expect(screen.getByText('Refunded')).toBeTruthy()
    expect(screen.getByText('$1,105.20')).toBeTruthy()
  })

  it('an offered action with enabled=false is drawn disabled', () => {
    const { container } = draw({ actions: [{ ...send, enabled: false }] })
    expect(button(container, 'Send payment')!.disabled).toBe(true)
  })

  it('mobile lays the facts in a two-column grid and stacks the controls', () => {
    const { container } = draw({ layout: 'mobile' })
    expect(container.querySelector('dl')!.className).toContain('grid-cols-2')
    expect(button(container, 'Send payment')!.className).toContain('w-full')
  })
})
