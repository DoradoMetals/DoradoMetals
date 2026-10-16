import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { ActionConfirmDialog } from '../ActionConfirmDialog'
import { button, buttonsIn, dialog } from './cardFixtures'

function open(extra: Partial<React.ComponentProps<typeof ActionConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ActionConfirmDialog
      open
      title="Finalize PO-2481?"
      body="Prices lock at today’s spot and the payout becomes payable."
      confirmLabel="Finalize"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extra}
    />
  )
  return { onConfirm, onCancel }
}

describe('ActionConfirmDialog (1204:25108 Kind=Confirm)', () => {
  it('Neutral, desktop: md dialog, Cancel then the primary confirm in a row', () => {
    const { onConfirm, onCancel } = open()
    expect(dialog()!.className).toContain('max-w-[26.25rem]')
    expect(dialog()!.textContent).toContain('Finalize PO-2481?')
    expect(buttonsIn(dialog()!)).toEqual(['Cancel', 'Finalize', 'Close'])
    expect(button(dialog()!, 'Finalize')!.className).toContain('bg-primary')
    const footer = button(dialog()!, 'Finalize')!.parentElement as HTMLElement
    expect(footer.className).toContain('gap-md')
    expect(footer.className).not.toContain('gap-xs')
    fireEvent.click(button(dialog()!, 'Finalize')!)
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(button(dialog()!, 'Cancel')!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('Danger: custom labels and a danger confirm', () => {
    open({
      intent: 'danger',
      title: 'Cancel PO-2481?',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
    })
    expect(buttonsIn(dialog()!)).toEqual(['Keep order', 'Cancel order', 'Close'])
    expect(button(dialog()!, 'Cancel order')!.className).toContain('bg-destructive')
  })

  it('mobile: small dialog, stacked footer, confirm on top, full width', () => {
    open({ layout: 'mobile' })
    expect(dialog()!.getAttribute('data-layout')).toBe('mobile')
    const footer = dialog()!.querySelector('.flex-col-reverse') as HTMLElement
    expect(footer.className).toContain('[&>button]:w-full')
  })

  it('size=lg widens the desktop dialog to 60rem; mobile stays sm', () => {
    open({ size: 'lg' })
    expect(dialog()!.className).toContain('max-w-[60rem]')
  })

  it('size=lg on mobile keeps the small dialog', () => {
    open({ size: 'lg', layout: 'mobile' })
    expect(dialog()!.className).not.toContain('max-w-[60rem]')
  })

  it('pending disables the confirm', () => {
    open({ pending: true })
    expect(button(dialog()!, 'Finalize')!.disabled).toBe(true)
  })
})
