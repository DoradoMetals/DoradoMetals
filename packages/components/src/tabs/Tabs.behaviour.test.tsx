import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Set({
  variant,
  ...props
}: React.ComponentProps<typeof Tabs> & { variant?: 'underline' | 'boxed' }) {
  return (
    <Tabs {...props}>
      <TabsList variant={variant} aria-label="Sections">
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
        <TabsTrigger value="c" disabled>
          Gamma
        </TabsTrigger>
        <TabsTrigger value="d">Delta</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Alpha panel</TabsContent>
      <TabsContent value="b">Beta panel</TabsContent>
      <TabsContent value="c">Gamma panel</TabsContent>
      <TabsContent value="d">Delta panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs state matrix', () => {
  it.each([
    ['underline', { variant: 'underline' as const }],
    ['boxed', { variant: 'boxed' as const }],
    ['vertical', { orientation: 'vertical' as const }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(<Set defaultValue="a" {...props} />)
    expect(getByRole('tablist')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default list keeps its class list', () => {
    const { getByRole } = setup(<Set defaultValue="a" />)
    expect(classList(getByRole('tablist'))).toMatchInlineSnapshot(`
      [
        "border-b",
        "border-border",
        "flex",
        "gap-2xs",
        "items-center",
        "relative",
      ]
    `)
  })

  it('boxed draws no underline indicator', () => {
    const { getByRole } = setup(<Set defaultValue="a" variant="boxed" />)
    expect(getByRole('tablist').querySelector('span[aria-hidden]')).toBeNull()
  })
})

describe('Tabs behaviour', () => {
  it('arrows move and activate, skipping a disabled tab; Home and End reach the ends', async () => {
    const { user, getByRole, getByText } = setup(<Set defaultValue="a" />)
    await user.tab()
    expect(document.activeElement).toBe(getByRole('tab', { name: 'Alpha' }))
    await user.keyboard('{ArrowRight}')
    expect(getByText('Beta panel')).toBeTruthy()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getByRole('tab', { name: 'Delta' }))
    await user.keyboard('{Home}')
    expect(getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{End}')
    expect(getByRole('tab', { name: 'Delta' }).getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getByRole('tab', { name: 'Alpha' }))
  })

  it('Tab leaves the list for the active panel', async () => {
    const { user, getByRole } = setup(<Set defaultValue="b" />)
    await user.tab()
    expect(document.activeElement).toBe(getByRole('tab', { name: 'Beta' }))
    await user.tab()
    expect(document.activeElement).toBe(getByRole('tabpanel'))
  })

  it('controlled: the value prop wins and the callback fires', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(<Set value="a" onValueChange={onValueChange} />)
    await user.click(getByRole('tab', { name: 'Delta' }))
    expect(onValueChange).toHaveBeenCalledWith('d')
    expect(getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true')
  })

  it('a disabled tab ignores a click', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(<Set defaultValue="a" onValueChange={onValueChange} />)
    await user.click(getByRole('tab', { name: 'Gamma' }))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('the underline indicator measures the active tab and follows focus', async () => {
    const rect = (left: number, width: number) =>
      ({
        left,
        width,
        top: 0,
        right: left + width,
        bottom: 0,
        height: 0,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute('role') === 'tablist') return rect(10, 400)
        const index = ['Alpha', 'Beta', 'Gamma', 'Delta'].indexOf(this.textContent ?? '')
        return rect(10 + index * 100, 80)
      })
    const { user, getByRole } = setup(<Set defaultValue="b" />)
    const bar = () => getByRole('tablist').querySelector<HTMLElement>('span[aria-hidden]')!
    expect(bar().style.left).toBe('100px')
    expect(bar().style.width).toBe('80px')
    await user.click(getByRole('tab', { name: 'Delta' }))
    expect(bar().style.left).toBe('300px')
    spy.mockRestore()
  })

  it('re-measures when the list resizes, and still measures with no ResizeObserver', () => {
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    class Immediate {
      constructor(private callback: () => void) {}
      observe() {
        this.callback()
      }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Immediate)
    const { unmount } = setup(<Set defaultValue="a" />)
    const withObserver = measured.mock.calls.length
    expect(withObserver).toBeGreaterThanOrEqual(4)
    unmount()
    vi.stubGlobal('ResizeObserver', undefined)
    measured.mockClear()
    setup(<Set defaultValue="a" />)
    expect(measured.mock.calls.length).toBe(2)
    vi.unstubAllGlobals()
  })

  it('with no active tab there is no indicator', () => {
    const { getByRole } = setup(<Set />)
    expect(getByRole('tablist').querySelector('span[aria-hidden]')).toBeNull()
  })
})
