import type { OrderState } from '@dorado/contracts'

export type OrderStateBadge = {
  intent: 'neutral' | 'success' | 'danger' | 'warning' | 'info'
  variant: 'solid' | 'soft' | 'outline'
}

const MID: ReadonlySet<OrderState> = new Set(['At Refiner', 'Awaiting Payout', 'Preparing', 'In Transit'])
const POST: ReadonlySet<OrderState> = new Set(['Ready to Pay', 'Completed'])

export const orderStateBadge = (state: OrderState | 'Draft'): OrderStateBadge => {
  if (state === 'Cancelled') return { intent: 'danger', variant: 'soft' }
  if (state === 'Draft') return { intent: 'neutral', variant: 'outline' }
  if (POST.has(state)) return { intent: 'success', variant: 'soft' }
  if (MID.has(state)) return { intent: 'info', variant: 'soft' }
  return { intent: 'warning', variant: 'soft' }
}
