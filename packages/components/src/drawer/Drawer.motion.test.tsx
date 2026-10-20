import { describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import * as React from 'react'

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return { ...actual, useReducedMotion: () => true }
})

import { Drawer, DrawerBody, DrawerHeader } from './Drawer'
import { setup } from '../test/render'

describe('ruling 167: motion', () => {
  it('under reduced motion a short drag snaps back with no transition', async () => {
    const setOpen = vi.fn()
    const { user } = setup(
      <Drawer open setOpen={setOpen} size="lg">
        <DrawerHeader title="New order" />
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    const panel = screen.getByRole('dialog')
    panel.getBoundingClientRect = () => ({ width: 300 }) as DOMRect
    const grabber = panel.querySelector('[data-drawer-grabber] > div') as HTMLElement
    await user.pointer({ keys: '[MouseLeft>]', target: grabber, coords: { clientX: 100 } })
    await act(() => new Promise<void>((r) => setTimeout(r, 120)))
    await user.pointer({ target: grabber, coords: { clientX: 120 } })
    await act(() => new Promise<void>((r) => setTimeout(r, 120)))
    await user.pointer({ keys: '[/MouseLeft]', target: grabber, coords: { clientX: 120 } })
    expect(setOpen).not.toHaveBeenCalled()
    expect(['', 'none']).toContain(panel.style.transform)
    expect(panel.style.transition).toBe('')
  })
})
