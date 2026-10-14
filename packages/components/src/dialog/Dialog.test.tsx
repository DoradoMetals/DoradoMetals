import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './Dialog'
import { axeViolations } from '../test/axe'

function openDialog(onOpenChange = () => {}) {
  return render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Confirm cancellation</DialogTitle>
        <DialogDescription>This cannot be undone.</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('is a labelled modal dialog, and axe finds nothing', async () => {
    openDialog()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(await axeViolations(document.body)).toEqual([])
  })

  it('open dialog adds no body padding', () => {
    openDialog()
    expect(document.body.style.paddingRight).toBe('')
  })

  it('Escape asks to close', () => {
    const onOpenChange = vi.fn()
    openDialog(onOpenChange)
    fireEvent.keyDown(document.body.querySelector('[role="dialog"]')!, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Dialog Overlay 64:517: the scrim is 70% background behind an 8px blur', () => {
    openDialog()
    const overlayEl = document.body.querySelector('.backdrop-blur-sm') as HTMLElement | null
    expect(overlayEl).toBeTruthy()
    expect(overlayEl?.className).toMatch(/bg-background\/70/)
  })

  it('the close button is a bare tertiary icon at 16px (Icon Button 457:75 Tertiary/SM geometry)', () => {
    openDialog()
    const close = document.body.querySelector('[aria-label="Close"]') as HTMLElement
    expect(close).toBeTruthy()
    expect(close.className).toMatch(/size-auto/)
    expect(close.className).not.toMatch(/size-\(--control-sm\)/)
    expect(close.className).toMatch(/\[&_svg\]:size-4/)
  })

  it('size=lg is 960px wide, added 2026-10-09 (41:55)', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent size="lg">
          <DialogTitle>Photos</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const content = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(content.className).toMatch(/max-w-\[60rem\]/)
  })

  it('footer Row is justify-end at gap-md (16px); Stacked reverses to gap-xs (8px), Confirm on top (41:55)', () => {
    const { container: row } = render(
      <DialogFooter>
        <button>Cancel</button>
        <button>Confirm</button>
      </DialogFooter>
    )
    expect(row.firstElementChild?.className).toMatch(/justify-end/)
    expect(row.firstElementChild?.className).toMatch(/gap-md/)

    const { container: stacked } = render(
      <DialogFooter stacked>
        <button>Cancel</button>
        <button>Confirm</button>
      </DialogFooter>
    )
    expect(stacked.firstElementChild?.className).toMatch(/flex-col-reverse/)
    expect(stacked.firstElementChild?.className).toMatch(/gap-xs/)
  })

  it('footer meta fills the slack at the left, text/subtle, off by default (41:55, 2026-10-09)', () => {
    const { container, rerender } = render(
      <DialogFooter>
        <button>Cancel</button>
      </DialogFooter>
    )
    expect(container.querySelector('.text-subtle')).toBeNull()

    rerender(
      <DialogFooter meta="IMG_4471.jpg · 2.4 MB">
        <button>Cancel</button>
      </DialogFooter>
    )
    const meta = container.querySelector('.text-subtle') as HTMLElement
    expect(meta?.textContent).toBe('IMG_4471.jpg · 2.4 MB')
    expect(meta.className).toMatch(/grow/)
  })
})
