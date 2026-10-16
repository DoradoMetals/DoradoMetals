import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { OrderHeaderView, type OrderHeaderViewProps } from '../OrderHeaderView'

const act = (name: string) => ({ name, confirm: null, override: null })

function draw(over: Partial<OrderHeaderViewProps> = {}) {
  const onAction = vi.fn()
  const props: OrderHeaderViewProps = {
    direction: 'purchase',
    state: 'Cancelled',
    name: 'Marguerite Whitfield',
    reference: 'PO-2481',
    place: 'Austin, TX',
    ordersToDate: 7,
    assignees: [{ value: 'u1', label: 'Dana Whitlock' }],
    assignedToId: 'u1',
    onAssign: vi.fn(),
    actions: [],
    onAction,
    ...over,
  }
  return { ...render(<OrderHeaderView {...props} />), onAction, props }
}

describe('Order header states (1204:26054)', () => {
  it('State=Cancelled: purchase eyebrow, badge, name, reference, place, count, Reopen', () => {
    const { onAction } = draw({ actions: [act('reopen')] })
    expect(screen.getByText('Purchase order')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.getByText('Marguerite Whitfield')).toBeTruthy()
    expect(screen.getByText('7 orders to date')).toBeTruthy()
    expect(document.body.textContent).toContain('PO-2481')
    expect(document.body.textContent).toContain('Austin, TX')
    fireEvent.click(screen.getByText('Reopen'))
    expect(onAction).toHaveBeenCalledWith(act('reopen'))
  })

  it('State=Expired: sales eyebrow, no actions drawn', () => {
    draw({
      direction: 'sale',
      state: 'Expired',
      name: undefined,
      reference: 'SO-1112',
      ordersToDate: 8,
    })
    expect(screen.getByText('Sales order')).toBeTruthy()
    expect(screen.getByText('Expired')).toBeTruthy()
    expect(screen.queryByText('Reopen')).toBeNull()
  })

  it('State=Awaiting Stock: Cancel and Allocate stock', () => {
    draw({
      direction: 'sale',
      state: 'Awaiting Stock',
      actions: [act('cancel'), act('allocate_stock')],
    })
    expect(screen.getByText('Awaiting Stock')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Allocate stock')).toBeTruthy()
  })

  it('State=Backorder: badge only when nothing is offered', () => {
    draw({ direction: 'sale', state: 'Backorder', actions: [act('unknown_action')] })
    expect(screen.getByText('Backorder')).toBeTruthy()
    expect(screen.queryByText('Cancel')).toBeNull()
  })

  it('singular count, and no buttons without onAction', () => {
    draw({ ordersToDate: 1, actions: [act('reopen')], onAction: undefined })
    expect(screen.getByText('1 order to date')).toBeTruthy()
    expect(screen.queryByText('Reopen')).toBeNull()
  })

  it('mobile layout renders', () => {
    const { container } = draw({ layout: 'mobile', actions: [act('reopen')] })
    expect(container.textContent).toContain('Marguerite Whitfield')
  })
})
