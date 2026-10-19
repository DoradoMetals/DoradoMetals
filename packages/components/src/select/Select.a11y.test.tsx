import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Select } from './Select'
import { expectNoAxeViolations } from '../test/axe'

const items = [
  { value: 'wire', label: 'Wire' },
  { value: 'check', label: 'Check' },
]

describe('Select accessibility', () => {
  it('required is announced, and an error message is tied to the trigger', async () => {
    const { getByRole, container } = render(
      <Select label="Payout" items={items} required invalid message="Choose a payout method" />
    )
    const trigger = getByRole('combobox', { name: 'Payout' })
    expect(trigger.getAttribute('aria-required')).toBe('true')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    const describedBy = trigger.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('Choose a payout method')
    await expectNoAxeViolations(container)
  })
})
