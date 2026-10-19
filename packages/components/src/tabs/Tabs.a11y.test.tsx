import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

describe('Tabs accessibility', () => {
  it('arrow keys, Home and End move between tabs', async () => {
    const { getByRole } = render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Order">
          <TabsTrigger value="a">Items</TabsTrigger>
          <TabsTrigger value="b">Payment</TabsTrigger>
          <TabsTrigger value="c">Shipping</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A</TabsContent>
        <TabsContent value="b">B</TabsContent>
        <TabsContent value="c">C</TabsContent>
      </Tabs>
    )
    const tab = (name: string) => getByRole('tab', { name })
    tab('Items').focus()
    fireEvent.keyDown(tab('Items'), { key: 'ArrowRight' })
    await vi.waitFor(() => expect(document.activeElement).toBe(tab('Payment')))
    fireEvent.keyDown(tab('Payment'), { key: 'End' })
    await vi.waitFor(() => expect(document.activeElement).toBe(tab('Shipping')))
    fireEvent.keyDown(tab('Shipping'), { key: 'Home' })
    await vi.waitFor(() => expect(document.activeElement).toBe(tab('Items')))
    expect(tab('Items').className).toContain('focus-ring')
  })
})
