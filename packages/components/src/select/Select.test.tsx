import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Select } from './Select'
import { axeViolations } from '../test/axe'

const items = [
  { value: 'ach', label: 'ACH transfer' },
  { value: 'wire', label: 'Wire' },
]

describe('Select', () => {
  it('is a labelled combobox, and axe finds nothing', async () => {
    const { getByRole, container } = render(<Select label="Payout method" items={items} />)
    expect(getByRole('combobox', { name: /Payout method/ })).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('invalid rides the aria attribute the chassis styles', () => {
    const { getByRole } = render(<Select label="Method" items={items} invalid />)
    expect(getByRole('combobox').getAttribute('aria-invalid')).toBe('true')
  })

  it('the chosen value shows in the trigger', () => {
    const { getByRole } = render(<Select label="Method" items={items} value="wire" />)
    expect(getByRole('combobox').textContent).toContain('Wire')
  })

  it('invalid turns the label destructive too, matching the Error state', () => {
    const { getByText } = render(<Select label="Method" items={items} invalid />)
    expect(getByText('Method').className).toContain('text-destructive')
  })

  it('disabled is the normal chrome at 50% (2026-09-05 convention)', () => {
    const { getByRole } = render(<Select label="Method" items={items} disabled />)
    const trigger = getByRole('combobox') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.className).toContain('bg-card')
    expect(trigger.className).toContain('disabled:opacity-50')
    expect(trigger.className).toContain('disabled:text-foreground-disabled')
    expect(trigger.className).not.toContain('disabled:bg-muted')
  })

  it('the trigger binds to size/h5, not size/body (38:75, 2026-09-04)', () => {
    const { getByRole } = render(<Select label="Method" items={items} />)
    expect(getByRole('combobox').className).toContain('text-h5')
  })
})
