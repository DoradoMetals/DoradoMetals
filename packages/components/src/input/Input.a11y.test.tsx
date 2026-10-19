import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Input } from './Input'
import { Textarea } from '../textarea/Textarea'
import { expectNoAxeViolations } from '../test/axe'

describe('Input and Textarea accessibility', () => {
  it('every field has a label, required is announced, errors ride aria-describedby and aria-invalid', async () => {
    const { getByRole, container } = render(
      <>
        <Input label="Email" required invalid message="Enter an email" />
        <Textarea label="Notes" required invalid message="Add a note" />
      </>
    )
    for (const [name, message] of [
      ['Email', 'Enter an email'],
      ['Notes', 'Add a note'],
    ] as const) {
      const field = getByRole('textbox', { name })
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.hasAttribute('required')).toBe(true)
      expect(
        document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
      ).toBe(message)
    }
    await expectNoAxeViolations(container)
  })

  it('a caller description is kept next to the message', () => {
    const { getByRole } = render(
      <Input label="Email" id="em" aria-describedby="extra" message="Enter an email" />
    )
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBe('em-message extra')
  })

  it('the textarea character count is described to the field', () => {
    const { getByRole } = render(<Textarea label="Notes" id="nt" showCount maxLength={10} />)
    const describedBy = getByRole('textbox').getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ')).toContain('nt-count')
    expect(document.getElementById('nt-count')?.textContent).toBe('0 / 10')
  })
})
