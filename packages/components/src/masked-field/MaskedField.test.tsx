import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { MaskedField } from './MaskedField'
import { axeViolations } from '../test/axe'

describe('MaskedField', () => {
  it('phone displays formatted, emits raw digits, and axe finds nothing', async () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <MaskedField mask="phone" label="Phone" value="5551234567" onValueChange={onValueChange} />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('(555) 123-4567')
    expect(input.getAttribute('inputmode')).toBe('tel')
    fireEvent.change(input, { target: { value: '(555) 123-45678' } })
    expect(onValueChange).toHaveBeenCalledWith('5551234567')
    expect(await axeViolations(container)).toEqual([])
  })

  it('card groups in fours and a full paste survives', () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <MaskedField mask="card" label="Card" value="" onValueChange={onValueChange} />
    )
    fireEvent.change(container.querySelector('input')!, { target: { value: '4242424242424242' } })
    expect(onValueChange).toHaveBeenCalledWith('4242424242424242')
  })

  it('card value renders in blocks of four', () => {
    const { container } = render(
      <MaskedField mask="card" label="Card" value="4242424242424242" onValueChange={() => {}} />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('4242 4242 4242 4242')
  })

  it('expiry types the slash for the user', () => {
    const { container } = render(
      <MaskedField mask="expiry" label="Expiry" value="0829" onValueChange={() => {}} />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('08 / 29')
  })

  it('amount grows thousands separators, emits them stripped', () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <MaskedField mask="amount" label="Amount" value="1250.5" onValueChange={onValueChange} />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('1,250.5')
    fireEvent.change(container.querySelector('input')!, { target: { value: '12,505.75' } })
    expect(onValueChange).toHaveBeenCalledWith('12505.75')
  })
})
