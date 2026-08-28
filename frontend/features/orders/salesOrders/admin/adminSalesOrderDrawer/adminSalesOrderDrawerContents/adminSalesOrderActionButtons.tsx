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
            variant={button.label === 'Adjust Price' ? 'outline' : 'default'}
            disabled={button.disabled}
            className={cn(
              'w-full transition-colors',
              isSecondaryStyle
                ? 'on-glass'
                : isTertiaryStyle
                ? 'bg-transparent text-primary flex justify-start p-0 h-4 hover:bg-transparent'
                : 'primary-on-glass'
            )}
          >
            {button.label}
          </Button>
        )
      })}
    </div>
  )
}
