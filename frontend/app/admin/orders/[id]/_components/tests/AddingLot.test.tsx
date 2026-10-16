import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { InventoryLotView } from '@dorado/contracts'

import { AddingLot } from '../AddingLot'
import { scrapLot } from './detailFixtures'

const stock = {
  ...scrapLot.lot,
  reference: 'Lot 2481-A',
  product_name: null,
  post_melt: 180.1,
  position: 'on_hand',
  order_id: null,
  order_number: null,
  order_reference: 'Whitfield',
  order_direction: null,
  refining_order_id: null,
  refining_order_number: null,
  refining_order_reference: null,
  refiner_id: null,
  refiner_name: null,
  variance: null,
} as unknown as InventoryLotView

describe('AddingLot', () => {
  test('sale: search stock, choose a lot, Add to Order sends its id', () => {
    const onAdd = vi.fn()
    const onQueryChange = vi.fn()
    render(
      <AddingLot
        mode="stock"
        enabled
        query=""
        onQueryChange={onQueryChange}
        results={[stock]}
        onAdd={onAdd}
      />
    )
    const add = screen.getByRole('button', { name: 'Add to Order' })
    expect(add).toHaveProperty('disabled', true)
    const box = screen.getByRole('combobox', { name: 'Find lot' })
    fireEvent.focus(box)
    fireEvent.mouseDown(screen.getByRole('option'))
    fireEvent.click(screen.getByRole('option'))
    expect(onQueryChange).toHaveBeenCalledWith('Lot 2481-A · Gold · 180.1 g · Whitfield')
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledWith(stock.id)
  })

  test('the add stays off when the action is not offered', () => {
    render(
      <AddingLot
        mode="stock"
        enabled={false}
        query=""
        onQueryChange={() => {}}
        results={[]}
        onAdd={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Add to Order' })).toHaveProperty('disabled', true)
  })

  test('purchase: declare a new lot by weight and purity', () => {
    const onAdd = vi.fn()
    render(
      <AddingLot mode="declare" enabled metals={[{ value: 'Gold', label: 'Gold' }]} onAdd={onAdd} />
    )
    const gross = screen.getByLabelText('Gross weight')
    fireEvent.change(gross, { target: { value: '61.3' } })
    fireEvent.blur(gross)
    const purity = screen.getByLabelText('Purity')
    fireEvent.change(purity, { target: { value: '73' } })
    fireEvent.blur(purity)
    expect(screen.getByRole('button', { name: 'Add to Order' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Metal')).toBeTruthy()
  })
})
