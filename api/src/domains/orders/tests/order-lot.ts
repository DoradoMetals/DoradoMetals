import assert from 'node:assert/strict'
import type { Lot, OrderLotView } from '@dorado/contracts'

export function asOrderLot(row: OrderLotView | Lot): OrderLotView {
  assert.ok('lot' in row, 'expected an order lot view, got a refiner lot')
  return row
}
