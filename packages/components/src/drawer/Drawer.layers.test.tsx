import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import * as React from 'react'

import { Drawer, DrawerBody, DrawerHeader } from './Drawer'
import { Select } from '../select/Select'
import { setup } from '../test/render'

const items = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
]

function Harness({ onValueChange }: { onValueChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(true)
  return (
    <Drawer open={open} setOpen={setOpen}>
      <DrawerHeader title="New order" />
      <DrawerBody>
        <Select label="Metal" items={items} onValueChange={onValueChange} />
      </DrawerBody>
    </Drawer>
  )
}

describe('Drawer with a nested Radix layer', () => {
  it('a Select opened inside the Drawer keeps focus without a loop, and focus returns to the trigger', async () => {
    const onValueChange = vi.fn()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = setup(<Harness onValueChange={onValueChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Metal' })
    await user.click(trigger)
    const listbox = await screen.findByRole('listbox')
    await waitFor(() => expect(listbox.contains(document.activeElement)).toBe(true))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('silver')
    expect(screen.queryByRole('listbox')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum call stack/)
    errors.mockRestore()
  })

  it('Escape closes the nested Select and leaves the Drawer open', async () => {
    const { user } = setup(<Harness onValueChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox', { name: 'Metal' })
    await user.click(trigger)
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('Drawer with a Select opened by pointer', () => {
  it('opens the listbox outside the inert sweep, picks an option and keeps the Drawer open', async () => {
    const onValueChange = vi.fn()
    const { user } = setup(<Harness onValueChange={onValueChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Metal' }))
    const listbox = await screen.findByRole('listbox')
    expect(listbox.closest('[inert]')).toBeNull()
    expect(listbox.closest('[aria-hidden="true"]')).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Gold' }))
    expect(onValueChange).toHaveBeenCalledWith('gold')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Metal' }).textContent).toContain('Gold')
  })

  it('stacks the listbox above the Drawer panel, so it is not painted behind it', async () => {
    const { user } = setup(<Harness onValueChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Metal' }))
    const listbox = await screen.findByRole('listbox')
    const z = (el: Element) => Number(/(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/.exec(el.className)?.[1] ?? 0)
    expect(z(listbox)).toBeGreaterThan(z(screen.getByRole('dialog', { hidden: true })))
  })
})
