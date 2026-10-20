import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'

import { Drawer, DrawerBody, DrawerFooter, DrawerHeader, type DrawerProps } from './Drawer'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness(props: Partial<DrawerProps>) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open lot
      </button>
      <Drawer open={open} setOpen={setOpen} {...props}>
        <DrawerHeader title="Lot 12" actions={<button type="button">Edit</button>} />
        <DrawerBody>
          <input aria-label="Note" />
        </DrawerBody>
        <DrawerFooter>
          <button type="button">Save</button>
        </DrawerFooter>
      </Drawer>
    </>
  )
}

const states: [string, Partial<DrawerProps>][] = [
  ['right default', {}],
  ['left', { anchor: 'left' }],
  ['bottom', { anchor: 'bottom' }],
  ['highest surface', { surface: 'highest' }],
  ['no surface', { surface: 'none' }],
  ['size sm', { size: 'sm' }],
  ['size md', { size: 'md' }],
  ['size lg', { size: 'lg', anchor: 'left' }],
  ['size full', { size: 'full' }],
]

describe('Drawer state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    setup(
      <Drawer open setOpen={() => {}} {...props}>
        <DrawerHeader title="Lot 12" />
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    const dialog = screen.getByRole('dialog', { name: 'Lot 12' })
    expect(within(dialog).getByRole('heading', { name: 'Lot 12' })).toBeTruthy()
    expect(within(dialog).getByText('Body')).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it('the default panel keeps its class list', () => {
    setup(
      <Drawer open setOpen={() => {}}>
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    expect(classList(document.querySelector('[role="dialog"]'))).toMatchInlineSnapshot(`
      [
        "[scrollbar-color:var(--border-strong)_transparent]",
        "[scrollbar-width:thin]",
        "bg-card",
        "border-border",
        "border-l",
        "bottom-0",
        "fixed",
        "flex",
        "flex-col",
        "lg:max-w-2/5",
        "lg:w-2/5",
        "max-w-full",
        "md:max-w-1/2",
        "md:w-1/2",
        "overflow-visible",
        "right-0",
        "sm:max-w-1/2",
        "sm:top-0",
        "sm:w-1/2",
        "top-23",
        "w-full",
        "will-change-transform",
        "xl:max-w-1/4",
        "xl:w-1/4",
        "z-[70]",
      ]
    `)
  })
})

describe('Drawer behaviour', () => {
  it('opens, closes from the header close button, and returns focus to the opener', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: 'Open lot' }))
    const dialog = getByRole('dialog', { name: 'Lot 12' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(getByRole('button', { name: 'Open lot' }))
  })

  it('Tab cycles header action, close, body and footer and wraps; Shift+Tab wraps back', async () => {
    const { user, getByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: 'Open lot' }))
    const order = ['Edit', 'Close', 'Note', 'Save'].map((name) =>
      name === 'Note' ? getByRole('textbox', { name }) : getByRole('button', { name })
    )
    order[0]!.focus()
    for (const next of [...order.slice(1), order[0]]) {
      await user.tab()
      expect(document.activeElement).toBe(next)
    }
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(order[3])
  })

  it('Escape closes; the scrim click closes', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: 'Open lot' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(queryByRole('dialog')).toBeNull())
    await user.click(getByRole('button', { name: 'Open lot' }))
    const scrim = getByRole('dialog').previousElementSibling as HTMLElement
    expect(scrim.getAttribute('aria-hidden')).toBe('true')
    await user.click(scrim)
    await waitFor(() => expect(queryByRole('dialog')).toBeNull())
  })

  it('closed, Escape asks nothing', async () => {
    const setOpen = vi.fn()
    const { user } = setup(
      <Drawer open={false} setOpen={setOpen}>
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    await user.keyboard('{Escape}')
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('controlled: open wins and setOpen is asked with false', async () => {
    const setOpen = vi.fn()
    const { user, getByRole } = setup(
      <Drawer open setOpen={setOpen}>
        <DrawerHeader title="Lot 12" />
      </Drawer>
    )
    await user.click(getByRole('button', { name: 'Close' }))
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(getByRole('dialog')).toBeTruthy()
  })

  it('a bottom sheet dragged down far enough closes; a small drag does not', async () => {
    const setOpen = vi.fn()
    const { user, getByRole } = setup(
      <Drawer open setOpen={setOpen} anchor="bottom" label="Filters">
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    const sheet = getByRole('dialog', { name: 'Filters details' })
    const at = (y: number) => ({ clientX: 10, clientY: y, pageX: 10, pageY: y })
    const frame = () =>
      act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const drag = async (to: number) => {
      await user.pointer({ keys: '[MouseLeft>]', target: sheet, coords: at(100) })
      for (const y of [100 + (to - 100) / 2, to]) {
        await user.pointer({ target: sheet, coords: at(y) })
        await frame()
      }
      await user.pointer({ keys: '[/MouseLeft]', target: sheet, coords: at(to) })
      await frame()
    }
    await drag(110)
    expect(setOpen).not.toHaveBeenCalled()
    await drag(300)
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})

describe('Drawer slots', () => {
  it('header title and actions, body and footer each render what they are given', () => {
    const { getByRole, getByText } = setup(
      <Drawer open setOpen={() => {}}>
        <DrawerHeader
          title={<span>Rich title</span>}
          actions={<button type="button">Act</button>}
          closeLabel="Dismiss"
        />
        <DrawerBody className="extra-body">Body text</DrawerBody>
        <DrawerFooter className="extra-foot">Footer text</DrawerFooter>
      </Drawer>
    )
    expect(getByRole('heading', { name: 'Rich title' })).toBeTruthy()
    expect(getByRole('button', { name: 'Act' })).toBeTruthy()
    expect(getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(getByText('Body text').className).toContain('extra-body')
    expect(getByText('Footer text').className).toContain('extra-foot')
  })

  it('a header outside a drawer draws its title and no close button', () => {
    const { getByRole, queryByRole } = setup(<DrawerHeader title="Loose" />)
    expect(getByRole('heading', { name: 'Loose' })).toBeTruthy()
    expect(queryByRole('button')).toBeNull()
  })

  it('a long title stays in the header next to the close button', () => {
    const long = 'Lot with a very long name '.repeat(8).trim()
    const { getByRole } = setup(
      <Drawer open setOpen={() => {}}>
        <DrawerHeader title={long} />
      </Drawer>
    )
    const title = getByRole('heading', { name: long })
    expect(title.textContent).toBe(long)
    expect(title.parentElement!.contains(getByRole('button', { name: 'Close' }))).toBe(true)
    expect(getByRole('dialog', { name: long })).toBeTruthy()
  })

  it('removing the header falls back to the label name', () => {
    const { getByRole, rerender } = setup(
      <Drawer open setOpen={() => {}} label="Lot">
        <DrawerHeader title="Lot 12" />
      </Drawer>
    )
    expect(getByRole('dialog', { name: 'Lot 12' })).toBeTruthy()
    rerender(
      <Drawer open setOpen={() => {}} label="Lot">
        <DrawerBody>Body</DrawerBody>
      </Drawer>
    )
    expect(getByRole('dialog', { name: 'Lot details' })).toBeTruthy()
  })
})
