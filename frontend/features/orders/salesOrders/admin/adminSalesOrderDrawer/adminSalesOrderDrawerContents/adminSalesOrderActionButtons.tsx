import { usePatchOrder } from '@/features/orders/patch'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'

import { SalesOrderActionButtonsProps, statusConfig } from '@/features/orders/salesOrders/types'

export function SalesOrderActionButtons({ order }: SalesOrderActionButtonsProps) {
  const patchOrder = usePatchOrder()

  const handleAction = (_action: string, status: string) => {
    patchOrder.mutate({ id: order.id, patch: { status } })
  }

  const getButtonActions = () => {
    switch (order.status) {
      case 'Pending':
        return [
          {
            label: 'Move to Preparing',
            action: 'move_to_Preparing',
            status: 'Preparing',
            disabled: false,
          },
        ]
      case 'Preparing':
        return [
          {
            label: 'Move to In Transit',
            action: 'move_to_in_transit',
            status: 'In Transit',
            disabled: !order.order_sent || !order.tracking_updated
          },
          {
            label: 'Back to Pending',
            action: 'move_to_pending',
            status: 'Pending',
            disabled: false,
          },
        ]
      case 'In Transit':
        return [
          {
            label: 'Move to Completed',
            action: 'move_to_completed',
            status: 'Completed',
            disabled: false,
          },
          {
            label: 'Back to Preparing',
            action: 'move_to_preparing',
            status: 'Preparing',
            disabled: false,
          },
        ]
      case 'Completed':
        return [
          {
            label: 'Back to In Transit',
            action: 'move_to_in_transit',
            status: 'In Transit',
            disabled: false,
          },
        ]

      default:
        return []
    }
  }

  const buttons = getButtonActions()
  const status = statusConfig[order.status ?? '']

  return (
    <div className="flex flex-col w-full gap-2 mt-4">
      {buttons.map((button, index) => {
        const isSecondaryStyle = index === 1
        const isTertiaryStyle = index === 2

        return (
          <Button
            key={index}
            onClick={() => handleAction(button.action, button.status)}
            /* Three hand-painted looks became the three EMPHASIS steps
               (ruling 25): the retired `on-glass` / `primary-on-glass` pair
               were both an outlined button, and the third spelled a bare link
               with a hover it then cancelled. */
            variant={isTertiaryStyle ? 'link' : 'secondary'}
            disabled={button.disabled}
            className={cn('w-full', isTertiaryStyle && 'justify-start')}
          >
            {button.label}
          </Button>
        )
      })}
    </div>
  )
}
