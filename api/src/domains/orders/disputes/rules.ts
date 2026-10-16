import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type { Direction, PurityDispute } from '@dorado/contracts'

export function assertOrderLot<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no order lot ${id}`)
}

export function assertPurchase(direction: Direction | null, id: string): void {
  if (direction !== 'purchase') {
    throw new Invalid(`order lot ${id} is not on a purchase, so its purity cannot be disputed`)
  }
}

export function assertNoOpenDispute(open: PurityDispute | undefined, lot_id: string): void {
  if (open) {
    throw new Conflict(`lot ${lot_id} already has an open purity dispute - resolve it first`)
  }
}

export function assertDispute<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no purity dispute ${id}`)
}

export function assertOpen(dispute: PurityDispute): void {
  if (dispute.resolved_at !== null) {
    throw new Conflict(`purity dispute ${dispute.id} is already resolved`)
  }
}

export function assertResolved<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row)
    throw new Conflict(`purity dispute ${id} changed under this request - nothing was written`)
}
