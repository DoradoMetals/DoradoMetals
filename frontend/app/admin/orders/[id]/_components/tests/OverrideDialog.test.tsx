import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { OverrideDialog } from '../OverrideDialog'
import { button, buttonsIn, dialog } from './cardFixtures'

function open(extra: Partial<React.ComponentProps<typeof OverrideDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <OverrideDialog
      open
      title="Record a second payout?"
      body="This customer has already been paid for this order."
      confirmLabel="Send payment"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extra}
    />
  )
  return { onConfirm, onCancel }
}

describe('OverrideDialog (1088:22690)', () => {
  it('Second payout, desktop: 560 wide, reason field, step-up line, Cancel then danger Send payment', () => {
    open()
    expect(dialog()!.className).toContain('max-w-[35rem]')
    const footer = dialog()!.querySelector('.justify-end') as HTMLElement
    expect(footer.className).toContain('gap-md')
    expect(footer.className).not.toContain('gap-xs')
    expect(screen.getByText('This customer has already been paid for this order.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Why are you overriding this refusal?')).toBeTruthy()
    expect(screen.getByText('Required · at least 10 characters')).toBeTruthy()
    expect(screen.getByText('You will be asked to re-authenticate before this sends.')).toBeTruthy()
    expect(buttonsIn(dialog()!)).toEqual(['Cancel', 'Send payment', 'Close'])
    expect(button(dialog()!, 'Send payment')!.className).toContain('bg-destructive')
  })

  it('Above total uses the same body with its own title', () => {
    open({
      title: 'Payout is above the order total?',
      body: 'The payout is more than this order is worth.',
    })
    expect(screen.getByText('Payout is above the order total?')).toBeTruthy()
  })

  it('confirm needs at least 10 characters and passes the trimmed reason', () => {
    const { onConfirm } = open()
    const send = button(dialog()!, 'Send payment')!
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'too short' } })
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: '  Bank returned the first one  ' },
    })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(onConfirm).toHaveBeenCalledWith('Bank returned the first one')
  })

  it('without a step-up the re-authenticate line is hidden', () => {
    open({ stepUp: false })
    expect(screen.queryByText('You will be asked to re-authenticate before this sends.')).toBeNull()
  })

  it('mobile stacks Send payment over Cancel at full width', () => {
    open({ layout: 'mobile' })
    expect(dialog()!.getAttribute('data-layout')).toBe('mobile')
    expect(dialog()!.querySelector('.flex-col-reverse')).toBeTruthy()
  })
})

describe('Payout override bodies (1088:22690)', () => {
  it('Case=Second payout and Case=Above total reuse the reason body with the case copy', async () => {
    const { OverrideDialog } = await import('../OverrideDialog')
    const { render, screen } = await import('@testing-library/react')
    const React = await import('react')
    for (const [title, body] of [
      ['Record a second payout?', 'This customer has already been paid for this order.'],
      ['Payout is above the order total?', 'The payout is more than this order is worth.'],
    ]) {
      const view = render(
        React.createElement(OverrideDialog, {
          open: true,
          title,
          body,
          confirmLabel: 'Send payment',
          onConfirm: () => {},
          onCancel: () => {},
        })
      )
      expect(screen.getByText(title)).toBeTruthy()
      expect(screen.getByText(body)).toBeTruthy()
      expect(screen.getByText('Required · at least 10 characters')).toBeTruthy()
      expect(
        screen.getByText('You will be asked to re-authenticate before this sends.')
      ).toBeTruthy()
      view.unmount()
    }
  })
})
