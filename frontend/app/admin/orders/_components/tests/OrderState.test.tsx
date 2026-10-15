import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { OrderState as OrderStateSchema } from '@dorado/contracts'

import { OrderState, orderStates } from '../OrderState'

const intents: Record<string, string> = {
  'Awaiting Receipt': 'text-warning',
  'Awaiting Finalize': 'text-warning',
  'At Refiner': 'text-info',
  'Ready to Pay': 'text-info',
  'Awaiting Payment': 'text-warning',
  Preparing: 'text-warning',
  'In Transit': 'text-info',
  'Pending Assay': 'text-warning',
  'Awaiting Delivery': 'text-warning',
  Settled: 'text-success',
  Completed: 'text-success',
  Disputed: 'text-destructive',
  Cancelled: 'text-destructive',
  Draft: 'text-foreground',
}

describe('OrderState', () => {
  it('covers exactly the contract enum, 14 variants', () => {
    expect([...orderStates].sort()).toEqual([...OrderStateSchema.options].sort())
    expect(orderStates).toHaveLength(14)
  })

  it.each(orderStates)('%s renders its label with its intent', (state) => {
    const { getByText } = render(<OrderState state={state} />)
    expect(getByText(state).className).toContain(intents[state])
  })

  it('Draft is the outline variant', () => {
    const { getByText } = render(<OrderState state="Draft" />)
    expect(getByText('Draft').className).toContain('border-border')
  })

  it('the renamed state reads Awaiting Finalize, never Awaiting Payout', () => {
    const { queryByText, getByText } = render(<OrderState state="Awaiting Finalize" />)
    expect(getByText('Awaiting Finalize')).toBeTruthy()
    expect(queryByText('Awaiting Payout')).toBeNull()
  })
})
