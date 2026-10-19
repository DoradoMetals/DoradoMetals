import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

import { OrderCard, type OrderCardLot } from '../OrderCard'

const lots: OrderCardLot[] = [
  { id: '1', name: '14K Gold', reference: '2481-A', weight: '60.9 g', purity: '73.0%' },
  { id: '2', name: '18K Gold', reference: '2481-B', qty: 'Qty 3', purity: '99.95%' },
  { id: '3', name: 'Sterling', reference: '2481-C', position: 'on RS-2488' },
]

function card(extra: Partial<React.ComponentProps<typeof OrderCard>> = {}) {
  return render(
    <OrderCard
      reference="PO-2481"
      customer="Marguerite Whitfield"
      state="Awaiting Finalize"
      lots={lots}
      moreCount={3}
      summary="5 lots · $18,420 est."
      date="Received Sep 2"
      {...extra}
    />
  )
}

describe('OrderCard', () => {
  it('purchase card (671:28446) renders reference, customer, state badge, lots, more, footer', async () => {
    const { container, getByText } = card({ onSelectedChange: () => {} })
    expect(getByText('PO-2481')).toBeTruthy()
    expect(getByText('Marguerite Whitfield').className).toContain('text-muted-foreground')
    expect(getByText('Awaiting Finalize').className).toContain('text-warning')
    expect(getByText('14K Gold')).toBeTruthy()
    expect(getByText('60.9 g')).toBeTruthy()
    expect(getByText('73.0%')).toBeTruthy()
    expect(getByText('Qty 3')).toBeTruthy()
    expect(getByText('+3 more')).toBeTruthy()
    expect(getByText('5 lots · $18,420 est.')).toBeTruthy()
    expect(getByText('Received Sep 2')).toBeTruthy()
    expect(container.querySelector('article')?.className).toContain('border-border')
  })

  it('a lot on another order is dimmed and shows its position instead of weight', () => {
    const { getByText, container } = card()
    expect(getByText('on RS-2488')).toBeTruthy()
    const placed = container.querySelector('[data-placed]') as HTMLElement
    expect(placed.className).toContain('opacity-60')
    expect(container.querySelectorAll('li')).toHaveLength(3)
  })

  it('selected (671:28470) takes the emphasis primary border and checks the box', () => {
    const { container, getByRole } = card({ selected: true, onSelectedChange: () => {} })
    expect(container.querySelector('article')?.className).toContain('border-primary')
    expect(getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
  })

  it('the checkbox reports the next value', () => {
    const onSelectedChange = vi.fn()
    const { getByRole } = card({ onSelectedChange })
    fireEvent.click(getByRole('checkbox'))
    expect(onSelectedChange).toHaveBeenCalledWith(true)
  })

  it('no checkbox without a handler, no more row without a count', () => {
    const { queryByRole, queryByText } = card({ moreCount: 0 })
    expect(queryByRole('checkbox')).toBeNull()
    expect(queryByText(/more/)).toBeNull()
  })

  it('sale card (671:28494) reads Placed and Awaiting Payment', () => {
    const { getByText } = card({
      reference: 'SO-1112',
      state: 'Awaiting Payment',
      date: 'Placed Sep 2',
    })
    expect(getByText('Placed Sep 2')).toBeTruthy()
    expect(getByText('Awaiting Payment').className).toContain('text-warning')
  })

  it('mobile (671:28731) left-aligns the more row at tile height', () => {
    const { getByText, container } = card({ layout: 'mobile' })
    expect(container.querySelector('article')?.getAttribute('data-layout')).toBe('mobile')
    expect(getByText('+3 more').className).toContain('h-9')
  })

  it('the reference is a link when href is given, and a context menu handler passes through', () => {
    const onContextMenu = vi.fn()
    const { getByRole, container } = card({ href: '/admin/orders/1', onContextMenu })
    expect(getByRole('link', { name: 'PO-2481' }).getAttribute('href')).toBe('/admin/orders/1')
    fireEvent.contextMenu(container.querySelector('article') as HTMLElement)
    expect(onContextMenu).toHaveBeenCalled()
  })
})

describe('OrderCard height (Figma 673:20388, 332x372)', () => {
  it('desktop holds the design min height and reserves the 28px more row', () => {
    const { container } = card({ moreCount: 0 })
    expect(container.querySelector('article')?.className).toContain('min-h-[372px]')
    expect(container.querySelector('[data-part="more"]')?.className).toContain('h-7')
  })

  it('mobile has no min height and no empty more row', () => {
    const { container } = card({ layout: 'mobile', moreCount: 0 })
    expect(container.querySelector('article')?.className).not.toContain('min-h-[372px]')
    expect(container.querySelector('[data-part="more"]')).toBeNull()
  })
})

describe('OrderCard whole-card selection', () => {
  it('with nothing selected a click on the card does not toggle (the link opens the order)', () => {
    const onToggle = vi.fn()
    const { container } = card({
      href: '/o/1',
      selectable: true,
      onToggle,
      onSelectedChange: () => {},
    })
    fireEvent.click(container.querySelector('article') as HTMLElement, { detail: 1 })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('once a card is selected, a click anywhere toggles and does not follow the link', () => {
    const onToggle = vi.fn()
    const { container, getByText } = card({
      href: '/o/1',
      selectable: true,
      selectionActive: true,
      onToggle,
      onSelectedChange: () => {},
    })
    const notPrevented = fireEvent.click(getByText('14K Gold'), { detail: 1 })
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
    // keyboard activation of the link still opens the order
    fireEvent.click(container.querySelector('a') as HTMLElement, { detail: 0 })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('on mobile a long press starts the selection', () => {
    vi.useFakeTimers()
    const onToggle = vi.fn()
    const { container } = card({
      layout: 'mobile',
      selectable: true,
      onToggle,
      onSelectedChange: () => {},
    })
    const article = container.querySelector('article') as HTMLElement
    fireEvent.pointerDown(article, { pointerType: 'touch' })
    vi.advanceTimersByTime(600)
    expect(onToggle).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(article)
    vi.useRealTimers()
  })
})
