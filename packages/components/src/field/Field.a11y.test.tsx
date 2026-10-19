import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Field } from './Field'
import { expectNoAxeViolations } from '../test/axe'

describe('Field accessibility', () => {
  it('ties its message to the control and marks it invalid', async () => {
    const { getByRole, container } = render(
      <Field label="Account name" htmlFor="acct" message="Required" invalid>
        <input id="acct" />
      </Field>
    )
    const input = getByRole('textbox', { name: 'Account name' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Required'
    )
    await expectNoAxeViolations(container)
  })

  it('keeps a description the control already carries', () => {
    const { getByRole } = render(
      <>
        <p id="hint">hint</p>
        <Field label="Name" htmlFor="n" message="Too short">
          <input id="n" aria-describedby="hint" />
        </Field>
      </>
    )
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBe('hint n-message')
  })
})
