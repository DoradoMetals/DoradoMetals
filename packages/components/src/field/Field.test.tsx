import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { FieldLabel, fieldOption, fieldPanel, fieldTrigger } from './Field'
import { axeViolations } from '../test/axe'

describe('Field chassis', () => {
  it('trigger wears the card border language and the invalid hook', () => {
    const c = fieldTrigger()
    expect(c).toContain('border-border')
    expect(c).toContain('focus-within:border-primary')
    expect(c).toContain('aria-[invalid=true]:border-destructive')
  })

  it('trigger and option text bind to size/h5, not size/body (2026-09-04)', () => {
    expect(fieldTrigger()).toContain('text-h5')
    expect(fieldOption()).toContain('text-h5')
  })

  it('disabled is the normal chrome at 50%, not a muted fill (2026-09-05 convention)', () => {
    const c = fieldTrigger()
    expect(c).toContain('bg-card')
    expect(c).toContain('disabled:opacity-50')
    expect(c).toContain('data-[disabled]:opacity-50')
    expect(c).toContain('disabled:text-foreground-disabled')
    expect(c).toContain('data-[disabled]:text-foreground-disabled')
    expect(c).not.toContain('disabled:bg-muted')
    expect(c).not.toContain('data-[disabled]:bg-muted')
  })

  it('the field value is 16px at Regular - text-h5 alone would carry weight 600', () => {
    expect(fieldTrigger()).toContain('text-h5')
    expect(fieldTrigger()).toContain('font-normal')
  })

  it('panel is the popover surface, option highlights with accent', () => {
    expect(fieldPanel()).toContain('bg-popover')
    expect(fieldOption()).toContain('data-[highlighted]:bg-accent')
  })

  it('FieldLabel labels, and axe finds nothing', async () => {
    const { container, getByText } = render(
      <label>
        <FieldLabel>Amount</FieldLabel>
        <input aria-label="Amount" />
      </label>
    )
    expect(getByText('Amount')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })
})
