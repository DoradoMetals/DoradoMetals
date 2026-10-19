import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Drawer, DrawerBody, DrawerHeader } from './Drawer'
import { expectNoAxeViolations } from '../test/axe'

function Harness() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open order
      </button>
      <Drawer open={open} setOpen={setOpen} aria-describedby="drawer-help">
        <DrawerHeader title="Order PO-1" />
        <DrawerBody>
          <p id="drawer-help">Review the order</p>
          <button type="button">Approve</button>
        </DrawerBody>
      </Drawer>
    </>
  )
}

describe('Drawer accessibility', () => {
  it('is labelled by its title and described by the given content', async () => {
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Open order' }))
    const dialog = getByRole('dialog', { name: 'Order PO-1' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBe('drawer-help')
    await expectNoAxeViolations(document.body)
  })

  it('focus moves in on open, stays trapped on Tab, and returns to the opener on Escape', async () => {
    const { getByRole, queryByRole } = render(<Harness />)
    const opener = getByRole('button', { name: 'Open order' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    const approve = getByRole('button', { name: 'Approve' })
    approve.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await vi.waitFor(() => expect(queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})
