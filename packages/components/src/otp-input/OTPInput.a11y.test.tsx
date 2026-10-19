import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { OTPInput } from './OTPInput'
import { expectNoAxeViolations } from '../test/axe'

describe('OTPInput accessibility', () => {
  it('the code field is described by the description, and resend is a real button', async () => {
    const onResend = vi.fn()
    const { getByRole, container } = render(
      <OTPInput
        value=""
        onValueChange={() => {}}
        autoFocus={false}
        title="Check your phone"
        description="We sent a 6-digit code"
        resendIn={0}
        onResend={onResend}
      />
    )
    const input = getByRole('textbox', { name: 'One-time code' })
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('We sent a 6-digit code')
    const resend = getByRole('button', { name: 'Resend code' })
    expect(resend.tagName).toBe('BUTTON')
    fireEvent.click(resend)
    expect(onResend).toHaveBeenCalledTimes(1)
    await expectNoAxeViolations(container)
  })
})
