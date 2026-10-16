import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { PayoutLines } from '../PayoutLines'

const methods = [
  { value: 'ACH', label: 'ACH Transfer' },
  { value: 'ECHECK', label: 'eCheck' },
]
const bank = [{ value: 'bank-1', label: 'Chase •••• 4417' }]

describe('PayoutLines (ruling 132)', () => {
  it('one line: Method and Pay to, no amount, trailing slot drawn', () => {
    render(
      <PayoutLines
        lines={[{ key: 'a', method: 'ACH', payTo: bank, payToId: 'bank-1' }]}
        methods={methods}
        trailing={<span>trailing</span>}
      />
    )
    expect(screen.getByText('Method')).toBeTruthy()
    expect(screen.getByText('Pay to')).toBeTruthy()
    expect(screen.queryByLabelText('Amount')).toBeNull()
    expect(screen.getByText('trailing')).toBeTruthy()
  })

  it('showPayTo=false hides Pay to', () => {
    render(
      <PayoutLines
        lines={[{ key: 'a', method: 'ACH', payTo: bank }]}
        methods={methods}
        showPayTo={false}
      />
    )
    expect(screen.queryByText('Pay to')).toBeNull()
  })

  it('two lines: each has an amount, edits report the index, trailing is dropped', () => {
    const onLineChange = vi.fn()
    const { container } = render(
      <PayoutLines
        lines={[
          { key: 'a', method: 'ACH', payTo: bank, amount: '1.00' },
          { key: 'b', method: 'ECHECK', payTo: bank, amount: '2.00' },
        ]}
        methods={methods}
        trailing={<span>trailing</span>}
        onLineChange={onLineChange}
      />
    )
    expect(container.querySelectorAll('[data-line]').length).toBe(2)
    expect(screen.queryByText('trailing')).toBeNull()
    fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '3.00' } })
    expect(onLineChange).toHaveBeenCalledWith(0, { amount: '3.00' })
  })

  it('disabled locks the amount fields; mobile stacks the line', () => {
    const { container } = render(
      <PayoutLines
        layout="mobile"
        disabled
        lines={[
          { key: 'a', method: 'ACH', amount: '1.00' },
          { key: 'b', method: 'ECHECK', amount: '2.00' },
        ]}
        methods={methods}
      />
    )
    expect((screen.getAllByLabelText('Amount')[0] as HTMLInputElement).disabled).toBe(true)
    expect(container.querySelector('[data-line]')!.className).toContain('flex-col')
  })
})
