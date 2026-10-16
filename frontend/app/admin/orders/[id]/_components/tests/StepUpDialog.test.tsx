import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { StepUpDialog } from '../StepUpDialog'
import { button, buttonsIn, dialog } from './cardFixtures'

function open(extra: Partial<React.ComponentProps<typeof StepUpDialog>> = {}) {
  const onVerify = vi.fn()
  const onCancel = vi.fn()
  const onPasskey = vi.fn()
  render(
    <StepUpDialog
      open
      destination="(•••) •••-0142"
      onVerify={onVerify}
      onCancel={onCancel}
      onPasskey={onPasskey}
      {...extra}
    />
  )
  return { onVerify, onCancel, onPasskey }
}

describe('StepUpDialog (1204:25108 Kind=Step-up, body 1204:24909)', () => {
  it('desktop: title, fresh sign-in line, six cells, passkey link, Cancel then Verify', () => {
    open()
    expect(screen.getByText('Confirm it’s you')).toBeTruthy()
    expect(screen.getByText('This action needs a fresh sign-in.')).toBeTruthy()
    expect(screen.getByText('Enter the 6-digit code we sent to (•••) •••-0142.')).toBeTruthy()
    expect(screen.getAllByTestId('otp-cell').length).toBe(6)
    expect(buttonsIn(dialog()!)).toEqual(['Use a passkey instead', 'Cancel', 'Verify', 'Close'])
  })

  it('note is Small, body gap md, passkey is a Link, footer gap md', () => {
    open()
    const note = screen.getByText('Enter the 6-digit code we sent to (•••) •••-0142.')
    expect(note.className).toContain('text-small')
    expect((note.parentElement as HTMLElement).className).toContain('gap-md')
    const passkey = button(dialog()!, 'Use a passkey instead')!
    expect(passkey.className).toContain('underline-offset-4')
    expect(passkey.className).not.toContain('tertiary')
    const footer = button(dialog()!, 'Verify')!.parentElement as HTMLElement
    expect(footer.className).toContain('gap-md')
    expect(footer.className).not.toContain('gap-xs')
  })

  it('Verify waits for six digits, then sends the code', () => {
    const { onVerify } = open()
    const verify = button(dialog()!, 'Verify')!
    expect(verify.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '481902' } })
    expect(verify.disabled).toBe(false)
    fireEvent.click(verify)
    expect(onVerify).toHaveBeenCalledWith('481902')
  })

  it('passkey and cancel', () => {
    const { onPasskey, onCancel } = open()
    fireEvent.click(button(dialog()!, 'Use a passkey instead')!)
    expect(onPasskey).toHaveBeenCalled()
    fireEvent.click(button(dialog()!, 'Cancel')!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('mobile stacks Verify over Cancel', () => {
    open({ layout: 'mobile' })
    expect(dialog()!.querySelector('.flex-col-reverse')).toBeTruthy()
  })
})
