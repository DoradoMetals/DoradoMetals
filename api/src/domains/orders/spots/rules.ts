import { Conflict } from '#shared/errors.ts'
import type { OrderRead } from '@dorado/contracts'

export function assertLockMovable(
  order: Pick<OrderRead, 'number' | 'spots_locked' | 'totals'>
): void {
  if (order.spots_locked && order.totals?.total != null) {
    throw new Conflict(
      `order ${order.number} is finalized, so its spots can be neither locked nor unlocked`
    )
  }
}
