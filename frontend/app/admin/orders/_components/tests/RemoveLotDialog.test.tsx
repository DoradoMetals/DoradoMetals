import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { RemoveLotDialog } from '../RemoveLotDialog'

function open(extra: Partial<React.ComponentProps<typeof RemoveLotDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <RemoveLotDialog open onConfirm={onConfirm} onCancel={onCancel} {...extra} />
  )
  return { ...utils, onConfirm, onCancel }
}

const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement

describe('RemoveLotDialog', () => {
  it('desktop (1199:23340) is the small dialog with Cancel then Remove in a row', async () => {
    open()
    expect(dialog().className).toContain('max-w-80')
    const footer = dialog().querySelector('.justify-end') as HTMLElement
    expect(footer.className).toContain('gap-md')
    expect(footer.className).not.toContain('gap-xs')
    expect(dialog().textContent).toContain('Remove from this order?')
    expect(dialog().textContent).toContain('The lot is kept.')
    const labels = [...dialog().querySelectorAll('button')].map(
      (b) => b.textContent || b.getAttribute('aria-label')
    )
    expect(labels).toEqual(['Cancel', 'Remove', 'Close'])
    expect(dialog().querySelector('.flex-col-reverse')).toBeNull()
  })

  it('mobile (1199:23369) stacks the footer with Remove on top at full width', () => {
    open({ layout: 'mobile' })
    const footer = dialog().querySelector('.flex-col-reverse') as HTMLElement
    expect(footer).toBeTruthy()
    expect(footer.className).toContain('[&>button]:w-full')
    expect(dialog().getAttribute('data-layout')).toBe('mobile')
  })

  it('Remove is the danger button and confirms; Cancel cancels', () => {
    const { onConfirm, onCancel } = open()
    const remove = [...dialog().querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove'
    ) as HTMLElement
    expect(remove.className).toContain('bg-destructive')
    fireEvent.click(remove)
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(
      [...dialog().querySelectorAll('button')].find(
        (b) => b.textContent === 'Cancel'
      ) as HTMLElement
    )
    expect(onCancel).toHaveBeenCalled()
  })

  it('pending disables Remove', () => {
    open({ pending: true })
    const remove = [...dialog().querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove'
    ) as HTMLButtonElement
    expect(remove.disabled).toBe(true)
  })

  it('renders nothing when closed', () => {
    render(<RemoveLotDialog open={false} onConfirm={() => {}} onCancel={() => {}} />)
    expect(dialog()).toBeNull()
  })

  it('askReason (ruling 144): Remove waits for a reason and confirms with the unlink body', () => {
    const { onConfirm } = open({ askReason: true })
    const remove = [...dialog().querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove'
    ) as HTMLButtonElement
    expect(remove.disabled).toBe(true)
    fireEvent.change(dialog().querySelector('input') as HTMLInputElement, {
      target: { value: '  Entered on the wrong order  ' },
    })
    expect(remove.disabled).toBe(false)
    fireEvent.click(remove)
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Entered on the wrong order' })
  })

  it('without askReason there is no reason field', () => {
    open()
    expect(dialog().querySelector('input')).toBeNull()
  })
})
