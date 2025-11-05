import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SalesOrderActionButtonsProps, statusConfig } from '@/types/sales-orders'
import { useMoveSalesOrderStatus } from '@/lib/queries/admin/useAdminSalesOrders'

export function SalesOrderActionButtons({ order }: SalesOrderActionButtonsProps) {
  const movePurchaseOrderStatus = useMoveSalesOrderStatus()

  const handleAction = (action: string, status: string) => {
    movePurchaseOrderStatus.mutate({
      order_status: status,
      order: order,
    })
  }

  const getButtonActions = () => {
    switch (order.sales_order_status) {
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
  const status = statusConfig[order.sales_order_status]

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
              'w-full transition-colors text-white',
              isSecondaryStyle
                ? cn(
                    'bg-card',
                    status?.text_color,
                    status?.hover_background_color,
                    'hover:text-white raised-off-page'
                  )
                : isTertiaryStyle
                ? cn(
                    'bg-transparent',
                    status?.text_color,
                    'flex justify-start p-0 h-4 hover:bg-transparent'
                  )
                : cn(status?.background_color, status?.hover_background_color, 'raised-off-page')
            )}
          >
            {button.label}
          </Button>
        )
      })}
    </div>
  )
}
