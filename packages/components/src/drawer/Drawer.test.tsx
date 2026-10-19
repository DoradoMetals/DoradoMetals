import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from './Drawer'
import { axeViolations } from '../test/axe'

function openDrawer(props: Partial<React.ComponentProps<typeof Drawer>> = {}) {
  const setOpen = props.setOpen ?? vi.fn()
  const utils = render(
    <Drawer open label="Order PO-2189" setOpen={setOpen} {...props}>
      <p>Drawer body</p>
    </Drawer>
  )
  return { ...utils, setOpen }
}

describe('Drawer', () => {
  it('is a labelled modal dialog, and axe finds nothing', async () => {
    openDrawer()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Order PO-2189 details')
    expect(await axeViolations(document.body)).toEqual([])
  })

  it('falls back to a generic accessible name when no label is given', () => {
    openDrawer({ label: undefined })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-label')).toBe('Details')
  })

  it('Escape closes it', () => {
    const { setOpen } = openDrawer()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('clicking the scrim closes it', () => {
    const { setOpen } = openDrawer()
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.click(overlay)
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('renders nothing when closed', () => {
    openDrawer({ open: false })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('carries the scrim over the page ground', () => {
    openDrawer()
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay.className).toContain('bg-background/70')
  })

  it('the default panel is the card surface in every size (Library 2026-10-19)', () => {
    for (const size of ['sm', 'md', 'lg', 'full'] as const) {
      const { unmount } = render(
        <Drawer open label={size} setOpen={vi.fn()} size={size}>
          <p>Drawer body</p>
        </Drawer>
      )
      const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
      expect(panel.className).toContain('bg-card')
      expect(panel.className).not.toContain('bg-highest')
      unmount()
    }
  })

  it('the highest surface draws a single hairline on the attached edge, not a box border', () => {
    openDrawer({ anchor: 'right', surface: 'highest' })
    let panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.className).toContain('border-l')
    expect(panel.className).not.toContain('border-r')
    expect(panel.className).not.toContain('border border-border')

    openDrawer({ anchor: 'left', surface: 'highest' })
    const panels = document.body.querySelectorAll('[role="dialog"]')
    panel = panels[panels.length - 1] as HTMLElement
    expect(panel.className).toContain('border-r')
  })

  it('surface card keeps the attached-edge hairline, and none paints nothing', () => {
    openDrawer({ surface: 'card', anchor: 'right' })
    let panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.className).toContain('bg-card')
    expect(panel.className).toContain('border-l')
    expect(panel.className).not.toContain('border border-border')

    openDrawer({ surface: 'none' })
    const panels = document.body.querySelectorAll('[role="dialog"]')
    panel = panels[panels.length - 1] as HTMLElement
    expect(panel.className).not.toContain('bg-highest')
    expect(panel.className).not.toContain('bg-card')
    expect(panel.className).not.toContain('border-border')
  })

  it('className merges onto the surface rather than replacing it', () => {
    openDrawer({ className: 'max-w-full' })
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.className).toContain('bg-card')
    expect(panel.className).toContain('max-w-full')
  })

  it('Side=Bottom (127:32) is the mobile sheet: rounded top, hairline on top, grab handle', async () => {
    openDrawer({ anchor: 'bottom' })
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.className).toContain('border-t')
    expect(panel.className).not.toContain('border-l')
    expect(panel.className).not.toContain('border-r')
    expect(panel.className).toContain('rounded-t-xl')
    expect(panel.className).toContain('bottom-0')
    const handle = panel.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(await axeViolations(document.body)).toEqual([])
  })

  it('grab handle row is 36x4, padded 8 top / 2 bottom to a 14px row (127:32, 2026-10-09)', () => {
    openDrawer({ anchor: 'bottom' })
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    const row = panel.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(row.className).toContain('pt-xs')
    expect(row.className).toContain('pb-3xs')
    const bar = row.firstElementChild as HTMLElement
    expect(bar.className).toContain('h-2xs')
    expect(bar.className).toContain('w-9')
  })

  it('Side=Right panel carries no padding of its own; the chrome parts pad themselves (127:32)', () => {
    openDrawer({ anchor: 'right' })
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.className).not.toMatch(/(^|\s)p-md(\s|$)/)
    expect(panel.className).not.toContain('space-y')
    expect(panel.className).toContain('flex-col')
  })

  it('DrawerHeader titles the dialog, closes it, and draws the hairline under itself', async () => {
    const setOpen = vi.fn()
    const { getByRole } = render(
      <Drawer open label="ignored" setOpen={setOpen}>
        <DrawerHeader title="Order PO-2189" />
        <DrawerBody>
          <p>Body</p>
        </DrawerBody>
        <DrawerFooter>
          <button type="button">Cancel</button>
          <button type="button">Save</button>
        </DrawerFooter>
      </Drawer>
    )
    const dialog = getByRole('dialog', { name: 'Order PO-2189' })
    expect(dialog.getAttribute('aria-label')).toBeNull()
    const heading = getByRole('heading', { name: 'Order PO-2189' })
    expect(heading.className).toContain('text-h5')
    const header = heading.parentElement as HTMLElement
    expect(header.className).toContain('border-b')
    expect(header.className).toContain('p-md')
    fireEvent.click(getByRole('button', { name: 'Close' }))
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(await axeViolations(document.body)).toEqual([])
  })

  it('DrawerBody pads md with an xs gap; DrawerFooter right-aligns its actions over a top hairline', () => {
    const { getByText } = render(
      <Drawer open setOpen={vi.fn()}>
        <DrawerBody>
          <p>Body text</p>
        </DrawerBody>
        <DrawerFooter>
          <button type="button">Save</button>
        </DrawerFooter>
      </Drawer>
    )
    const body = getByText('Body text').parentElement as HTMLElement
    expect(body.className).toContain('p-md')
    expect(body.className).toContain('gap-xs')
    const footer = getByText('Save').parentElement as HTMLElement
    expect(footer.className).toContain('justify-end')
    expect(footer.className).toContain('border-t')
    expect(footer.className).toContain('gap-xs')
  })

  it.each([
    ['sm', 'sm:w-(--drawer-sm)'],
    ['md', 'sm:w-(--drawer-md)'],
    ['lg', 'sm:w-(--drawer-lg)'],
  ] as const)('size %s is full width on mobile and the Library width from sm up', (size, width) => {
    openDrawer({ size })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.className).toContain('w-full')
    expect(dialog.className).toContain(width)
    expect(dialog.className).toContain('right-0')
  })

  it('size full stays the whole viewport width at every breakpoint', () => {
    openDrawer({ size: 'full' })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.className).toContain('w-full')
    expect(dialog.className).not.toContain('sm:w-')
  })

  it('the scrim blurs the page behind', () => {
    openDrawer()
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay.className).toContain('backdrop-blur-sm')
  })

  it('the footer stacks on mobile and lines up on the right from sm', () => {
    const { getByText } = render(
      <Drawer open setOpen={vi.fn()}>
        <DrawerFooter>
          <span>Save</span>
        </DrawerFooter>
      </Drawer>
    )
    const footer = getByText('Save').parentElement as HTMLElement
    expect(footer.className).toContain('flex-col')
    expect(footer.className).toContain('sm:flex-row')
  })

  it('the body is the only scroll region, between a fixed header and footer, in every size (127:32)', () => {
    for (const size of ['sm', 'md', 'lg', 'full', undefined] as const) {
      const { unmount } = render(
        <Drawer open label="Scroll" setOpen={vi.fn()} size={size}>
          <DrawerHeader title="Title" />
          <DrawerBody>Body</DrawerBody>
          <DrawerFooter>Footer</DrawerFooter>
        </Drawer>
      )
      const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
      expect(panel.className).toContain('overflow-hidden')
      expect(panel.className).not.toContain('overflow-y-auto')
      const [header, body, footer] = Array.from(panel.children) as HTMLElement[]
      expect(body!.className).toContain('overflow-y-auto')
      expect(body!.className).toContain('min-h-0')
      for (const fixed of [header!, footer!]) {
        expect(fixed.className).toContain('shrink-0')
        expect(fixed.className).not.toContain('overflow')
      }
      unmount()
    }
  })
})
