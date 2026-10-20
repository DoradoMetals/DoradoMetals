import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'

import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerFooterAlert,
  DrawerHeader,
  DrawerPrimary,
  type DrawerProps,
} from './Drawer'
import { Alert } from '../alert/Alert'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness(props: Partial<DrawerProps> & { onOpenChange?: (open: boolean) => void }) {
  const { onOpenChange, ...rest } = props
  const [open, setOpen] = React.useState(true)
  return (
    <>
      <main data-testid="page">
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </main>
      <Drawer
        open={open}
        setOpen={(next) => {
          onOpenChange?.(next)
          setOpen(next)
        }}
        size="lg"
        {...rest}
      >
        <DrawerHeader title="New order" />
        <DrawerBody>
          <input aria-label="Note" />
          <div style={{ height: 2000 }}>Tall</div>
        </DrawerBody>
        <DrawerFooter>
          <DrawerPrimary>Continue</DrawerPrimary>
        </DrawerFooter>
      </Drawer>
    </>
  )
}

const panel = () => screen.getByRole('dialog')

function widen(el: HTMLElement, width = 300) {
  el.getBoundingClientRect = () =>
    ({ width, height: 800, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 800 }) as DOMRect
}

const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function drag(
  user: ReturnType<typeof setup>['user'],
  target: Element,
  to: number,
  slow = true
) {
  await user.pointer({ keys: '[MouseLeft>]', target, coords: { clientX: 100, clientY: 400 } })
  await user.pointer({ target, coords: { clientX: 100 + (to - 100) / 2, clientY: 400 } })
  if (slow) await pause(150)
  await user.pointer({ target, coords: { clientX: to, clientY: 400 } })
  if (slow) await pause(150)
  await user.pointer({ keys: '[/MouseLeft]', target, coords: { clientX: to, clientY: 400 } })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ruling 167: dismissing the Drawer', () => {
  it('a drag on the left-edge grabber past a third of the width closes it; a short slow drag springs back', async () => {
    const onOpenChange = vi.fn()
    const { user } = setup(<Harness onOpenChange={onOpenChange} />)
    widen(panel())
    const grabber = panel().querySelector('[data-drawer-grabber] > div') as HTMLElement
    expect(grabber.className).toContain('size-11')
    expect(grabber.className).toContain('justify-center')
    const line = grabber.parentElement!
    expect(line.className).toContain('-left-px')
    expect(line.className).toContain('w-px')
    expect(line.className).toContain('items-center')
    expect(line.className).toContain('justify-center')
    const bar = grabber.querySelector('[data-drawer-grabber-bar]') as HTMLElement
    expect(bar.className).toContain('w-[3px]')
    expect(bar.className).toContain('rounded-full')
    expect(bar.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(grabber.querySelector('[data-drawer-grabber-pill]')).toBeNull()
    expect(panel().className).toContain('overflow-visible')

    await drag(user, grabber, 160)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(panel().style.transform).toBe('')

    await drag(user, grabber, 260)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('the panel follows the finger while dragging', async () => {
    const { user } = setup(<Harness />)
    widen(panel())
    const header = panel().querySelector('[data-drawer-header]') as HTMLElement
    await user.pointer({
      keys: '[MouseLeft>]',
      target: header,
      coords: { clientX: 100, clientY: 20 },
    })
    await user.pointer({ target: header, coords: { clientX: 150, clientY: 20 } })
    expect(panel().style.transform).toBe('translateX(50px)')
    await user.pointer({
      keys: '[/MouseLeft]',
      target: header,
      coords: { clientX: 150, clientY: 20 },
    })
  })

  it('a fast fling from the header closes it below the distance threshold', async () => {
    const onOpenChange = vi.fn()
    const { user } = setup(<Harness onOpenChange={onOpenChange} />)
    widen(panel(), 900)
    const header = panel().querySelector('[data-drawer-header]') as HTMLElement
    await drag(user, header, 160, false)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('a drag that starts in the body does nothing', async () => {
    const onOpenChange = vi.fn()
    const { user } = setup(<Harness onOpenChange={onOpenChange} />)
    widen(panel())
    await drag(user, screen.getByText('Tall'), 290)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('closes on a click outside the panel and on Escape', async () => {
    const onOpenChange = vi.fn()
    setup(<Harness onOpenChange={onOpenChange} />)
    fireEvent.click(document.querySelector('[data-drawer-scrim]')!)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    onOpenChange.mockClear()
    setup(<Harness onOpenChange={onOpenChange} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('dismissible={false} turns off swipe, outside click and Escape, and drops the grabber', async () => {
    const onOpenChange = vi.fn()
    const { user } = setup(<Harness onOpenChange={onOpenChange} dismissible={false} />)
    widen(panel())
    expect(panel().querySelector('[data-drawer-grabber]')).toBeNull()
    await drag(user, panel().querySelector('[data-drawer-header]')!, 290)
    fireEvent.click(document.querySelector('[data-drawer-scrim]')!)
    fireEvent.keyDown(document, { key: 'Escape' })
    await pause(10)
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('the X goes through the same close path: confirmClose is asked, and busy blocks it', async () => {
    const onOpenChange = vi.fn()
    const confirmClose = vi.fn(async () => false)
    setup(<Harness onOpenChange={onOpenChange} confirmClose={confirmClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(confirmClose).toHaveBeenCalledWith('close'))
    expect(onOpenChange).not.toHaveBeenCalled()
    confirmClose.mockImplementation(async () => true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('while busy the X is disabled and Escape and outside clicks do nothing', async () => {
    const onOpenChange = vi.fn()
    setup(<Harness onOpenChange={onOpenChange} busy />)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-drawer-scrim]')!)
    await pause(10)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('showClose={false} hides the X', () => {
    setup(<Harness showClose={false} />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('confirmClose is asked before swipe, outside click and Escape, and a false answer keeps it open', async () => {
    const onOpenChange = vi.fn()
    const confirmClose = vi.fn(async () => false)
    const { user } = setup(<Harness onOpenChange={onOpenChange} confirmClose={confirmClose} />)
    widen(panel())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-drawer-scrim]')!)
    await drag(user, panel().querySelector('[data-drawer-grabber] > div')!, 290)
    await waitFor(() => expect(confirmClose).toHaveBeenCalledTimes(3))
    expect(confirmClose.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      'escape',
      'outside',
      'swipe',
    ])
    expect(onOpenChange).not.toHaveBeenCalled()
    await waitFor(() => expect(panel().style.transform).toBe(''))

    confirmClose.mockImplementation(async () => true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('ruling 167: the open Drawer and the page behind it', () => {
  it('makes the page inert (aria-hidden where inert is unsupported) and restores it on close', async () => {
    const onOpenChange = vi.fn()
    setup(<Harness onOpenChange={onOpenChange} />)
    const root = screen.getByTestId('page').parentElement!
    expect(root.hasAttribute('inert')).toBe(true)
    if (!('inert' in HTMLElement.prototype)) expect(root.getAttribute('aria-hidden')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(root.hasAttribute('inert')).toBe(false)
    expect(root.hasAttribute('aria-hidden')).toBe(false)
  })

  it('locks the page scroll and keeps the scrollbar gutter, then restores both', async () => {
    setup(<Harness />)
    const html = document.documentElement
    expect(html.style.overflow).toBe('hidden')
    expect(html.style.scrollbarGutter).toBe('stable')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(html.style.overflow).toBe('')
    expect(html.style.scrollbarGutter).toBe('')
  })

  it('moves focus to the title on open', () => {
    setup(<Harness />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'New order' }))
  })

  it('the header shows its hairline only once the body has scrolled, and scroll resets on reopen', async () => {
    const { user } = setup(<Harness />)
    const header = () => panel().querySelector('[data-drawer-header]') as HTMLElement
    const body = () => screen.getByText('Tall').parentElement as HTMLElement
    expect(header().className).toContain('border-transparent')
    body().scrollTop = 120
    fireEvent.scroll(body())
    expect(header().className).toContain('border-border')
    expect(header().getAttribute('data-scrolled')).toBe('true')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(body().scrollTop).toBe(0)
    expect(header().className).toContain('border-transparent')
  })

  it('lifts the panel above the on-screen keyboard and scrolls the focused field into view', () => {
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 0 })
    vi.stubGlobal('visualViewport', viewport)
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
    setup(<Harness />)
    const field = screen.getByRole('textbox', { name: 'Note' })
    const scrolled = vi.fn()
    field.scrollIntoView = scrolled
    field.focus()
    act(() => {
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(panel().style.bottom).toBe(`${window.innerHeight - 500}px`)
    expect(scrolled).toHaveBeenCalled()
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    vi.unstubAllGlobals()
  })

  it('the footer carries the safe-area inset', () => {
    setup(<Harness />)
    const footer = screen.getByRole('button', { name: 'Continue' }).parentElement as HTMLElement
    expect(footer.className).toContain('env(safe-area-inset-bottom)')
  })

  it('busy disables the primary with a spinner and marks the body aria-busy', () => {
    setup(<Harness busy />)
    const primary = screen.getByRole('button', { name: /Continue/ })
    expect(primary.hasAttribute('disabled')).toBe(true)
    expect(primary.getAttribute('aria-busy')).toBe('true')
    expect(primary.querySelector('[role="status"]')).toBeTruthy()
    expect(screen.getByText('Tall').parentElement!.getAttribute('aria-busy')).toBe('true')
  })

  it('a footer alert is role alert, floats above the buttons and takes focus when it appears', () => {
    function WithAlert() {
      const [failed, setFailed] = React.useState(false)
      return (
        <Drawer open setOpen={() => {}}>
          <DrawerHeader title="New order" />
          <DrawerBody>Body</DrawerBody>
          <DrawerFooter>
            {failed && (
              <DrawerFooterAlert>
                <Alert intent="danger" title="Could not create the order">
                  Refused.
                </Alert>
              </DrawerFooterAlert>
            )}
            <button type="button" onClick={() => setFailed(true)}>
              Create
            </button>
          </DrawerFooter>
        </Drawer>
      )
    }
    render(<WithAlert />)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    const alert = screen.getByRole('alert')
    expect(document.activeElement).toBe(alert)
    const wrapper = alert.closest('[data-drawer-footer-alert]') as HTMLElement
    expect(wrapper.className).toContain('absolute')
    expect(wrapper.className).toContain('bottom-full')
    expect(wrapper.parentElement!.className).toContain('relative')
  })

  it('axe finds nothing on the open drawer', async () => {
    setup(<Harness />)
    await expectNoAxeViolations(document.body)
  })
})
