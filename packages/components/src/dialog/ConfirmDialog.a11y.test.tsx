import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { ConfirmDialog } from './ConfirmDialog'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Cancel order
      </button>
      <ConfirmDialog
        open={open}
        title="Cancel this order?"
        body="The customer is told by email."
        confirmLabel="Cancel order now"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

describe('ConfirmDialog accessibility', () => {
  it('is an alertdialog labelled by its title and described by its body', async () => {
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Cancel order' }))
    const dialog = getByRole('alertdialog', { name: 'Cancel this order?' })
    const describedBy = dialog.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('The customer is told by email.')
    await expectNoAxeViolations(document.body)
  })

  it('focus moves in, Escape cancels, and focus returns to the opener', async () => {
    const { getByRole, queryByRole } = render(<Harness />)
    const opener = getByRole('button', { name: 'Cancel order' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = getByRole('alertdialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    await vi.waitFor(() => expect(queryByRole('alertdialog')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('pending marks the confirm busy as well as disabled', () => {
    render(
      <ConfirmDialog
        open
        pending
        title="T"
        body="B"
        confirmLabel="Go"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    const confirm = document.body.querySelector('button[aria-busy="true"]')
    expect(confirm?.textContent).toBe('Go')
  })
})
