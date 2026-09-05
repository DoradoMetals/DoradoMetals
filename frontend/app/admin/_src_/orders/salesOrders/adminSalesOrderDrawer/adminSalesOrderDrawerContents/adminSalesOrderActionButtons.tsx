import { Button } from '@dorado/components'
import { usePatchOrder } from '@dorado/client'
import { cn } from '@/shared/utils/cn'
import { SalesOrderActionButtonsProps } from '@/shared/types/salesOrders'
import { actionLabel } from '../../../actionLabel'

// The sales twin, and the same change: a `switch (order.status)` with four
// hard-coded lists and a `disabled: !order.order_sent || !order.tracking_updated`
// gate - the rule that a sale is not "In Transit" until a refiner has it and
// it carries a tracking number. That gate is in rules.ts now and this renders
// what it allowed.
export function SalesOrderActionButtons({ view }: SalesOrderActionButtonsProps) {
  const { order, actions } = view
  const patchOrder = usePatchOrder()

  return (
    <div className="flex flex-col w-full gap-2 mt-4">
      {actions.statuses.map((status, index) => (
        <Button
          key={status}
          onClick={() => patchOrder.mutate({ id: order.id, patch: { status } })}
          variant={index >= 2 ? 'tertiary' : 'secondary'}
          disabled={patchOrder.isPending}
          className={cn('w-full', index >= 2 && 'justify-start')}
        >
          {actionLabel(order.direction, order.status, status)}
        </Button>
      ))}
    </div>
  )
}
