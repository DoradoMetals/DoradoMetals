import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Popover } from './Popover'
import { Drawer } from '../drawer/Drawer'
import { expectNoAxeViolations } from '../test/axe'

describe('Popover accessibility', () => {
  it('the trigger controls the panel it opens', async () => {
    const { getByRole, container } = render(
      <Popover label="Metal" panel={<button type="button">Gold</button>} />
    )
    const trigger = getByRole('button', { name: 'Metal' })
    fireEvent.click(trigger)
    const panel = getByRole('dialog')
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    await expectNoAxeViolations(container)
  })

  it('Escape from inside the panel closes it and returns focus to the trigger', () => {
    const { getByRole, queryByRole } = render(
      <Popover label="Metal" panel={<button type="button">Gold</button>} />
    )
    const trigger = getByRole('button', { name: 'Metal' })
    fireEvent.click(trigger)
    const inner = getByRole('button', { name: 'Gold' })
    inner.focus()
    fireEvent.keyDown(inner, { key: 'Escape' })
    expect(queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape inside a popover within a drawer closes only the popover', () => {
    const setOpen = vi.fn()
    const { getByRole, queryByRole } = render(
      <Drawer open setOpen={setOpen} label="Order">
        <Popover label="Metal" panel={<button type="button">Gold</button>} />
      </Drawer>
    )
    fireEvent.click(getByRole('button', { name: 'Metal' }))
    const inner = getByRole('button', { name: 'Gold' })
    inner.focus()
    fireEvent.keyDown(inner, { key: 'Escape' })
    expect(queryByRole('button', { name: 'Gold' })).toBeNull()
    expect(setOpen).not.toHaveBeenCalled()
  })
})
