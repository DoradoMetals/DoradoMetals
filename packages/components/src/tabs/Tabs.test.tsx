import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'
import { axeViolations } from '../test/axe'

function renderTabs() {
  return render(
    <Tabs defaultValue="buy">
      <TabsList>
        <TabsTrigger value="buy">Buy</TabsTrigger>
        <TabsTrigger value="sell">Sell</TabsTrigger>
      </TabsList>
      <TabsContent value="buy">Buy panel</TabsContent>
      <TabsContent value="sell">Sell panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('is a tablist wired to panels, and axe finds nothing', async () => {
    const { getByRole, container } = renderTabs()
    expect(getByRole('tablist')).toBeTruthy()
    const active = getByRole('tab', { name: 'Buy' })
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tabpanel').textContent).toBe('Buy panel')
    expect(await axeViolations(container)).toEqual([])
  })

  it('clicking switches the panel', () => {
    const { getByRole } = renderTabs()

    fireEvent.mouseDown(getByRole('tab', { name: 'Sell' }), { button: 0 })
    expect(getByRole('tabpanel').textContent).toBe('Sell panel')
  })

  it('underline (Tab Bar / Underline 160:45): a single sliding rail segment, not a per-trigger border', () => {
    const { getByRole, container } = renderTabs()
    const tablist = getByRole('tablist')
    expect(tablist.className).toMatch(/border-b border-border/)

    const indicator = container.querySelector('[aria-hidden="true"]')
    expect(indicator).toBeTruthy()
    expect(indicator?.className).toMatch(/bg-primary/)
    expect(indicator?.className).toMatch(/transition-\[left,width\]/)
    expect(indicator?.className).toMatch(/motion-reduce:transition-none/)

    const sell = getByRole('tab', { name: 'Sell' })
    expect(sell.className).not.toMatch(/border-b-2/)
    fireEvent.focus(sell)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('boxed variant carries no sliding rail', () => {
    const { container, getByRole } = render(
      <Tabs defaultValue="buy">
        <TabsList variant="boxed">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
        <TabsContent value="buy">Buy panel</TabsContent>
        <TabsContent value="sell">Sell panel</TabsContent>
      </Tabs>
    )
    expect(getByRole('tablist').className).toMatch(/bg-muted/)
    expect(container.querySelector('[aria-hidden="true"]')).toBe(null)
  })

  it('a fourth tab is just a fourth child - the Tab Bar redistributes (39:37, 2026-09-05)', () => {
    const { getAllByRole, getByRole } = render(
      <Tabs defaultValue="shipment">
        <TabsList>
          <TabsTrigger value="shipment">Shipment</TabsTrigger>
          <TabsTrigger value="pickup">Pickup</TabsTrigger>
          <TabsTrigger value="appointment">Appointment</TabsTrigger>
          <TabsTrigger value="return">Return</TabsTrigger>
        </TabsList>
        <TabsContent value="shipment">Shipment panel</TabsContent>
        <TabsContent value="pickup">Pickup panel</TabsContent>
        <TabsContent value="appointment">Appointment panel</TabsContent>
        <TabsContent value="return">Return panel</TabsContent>
      </Tabs>
    )
    expect(getAllByRole('tab')).toHaveLength(4)
    fireEvent.mouseDown(getByRole('tab', { name: 'Return' }), { button: 0 })
    expect(getByRole('tabpanel').textContent).toBe('Return panel')
  })
})
