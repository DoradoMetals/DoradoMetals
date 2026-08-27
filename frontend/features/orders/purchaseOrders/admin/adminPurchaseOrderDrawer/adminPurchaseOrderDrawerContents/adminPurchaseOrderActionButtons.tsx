import { Button } from '@/shared/ui/base/button'
import { PurchaseOrderActionButtonsProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { cn } from '@/shared/utils/cn'
import { useMemo } from 'react'
import { useSpotPrices } from '@/features/spots/queries'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'
import { useAcceptOrder, useAddFundsToAccount, useMovePurchaseOrderStatus } from '@/features/orders/purchaseOrders/admin/queries'


export function PurchaseOrderActionButtons({ order }: PurchaseOrderActionButtonsProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const movePurchaseOrderStatus = useMovePurchaseOrderStatus()
  const acceptOrder = useAcceptOrder()
  const addAccountFunds = useAddFundsToAccount()

  const handleAction = (action: string, status: string) => {
    // OFFERS ARE GONE (086). What survives of the accept transition is its
    // PRICING half: accepting snapshots the spots, prices every line and writes
    // the total, so it goes through its own route rather than a bare status
    // move. Every other transition is a status move.
    if (action === 'move_to_accepted') {
      acceptOrder.mutate({
        purchase_order: order,
        order_spots: orderSpotPrices,
        spot_prices: spotPrices,
      })
    } else if (action === 'move_to_completed' && order.payout.method === 'DORADO_ACCOUNT') {
      addAccountFunds.mutate({ purchase_order: order, spots: orderSpotPrices })
      movePurchaseOrderStatus.mutate({
        order_status: status,
        order: order,
      })
    } else {
      movePurchaseOrderStatus.mutate({
        order_status: status,
        order: order,
      })
    }
  }

  const allItemsConfirmed = useMemo(() => {
    return order.order_items.every((item) => item.confirmed)
  }, [order.order_items])

  const getButtonActions = () => {
    switch (order.purchase_order_status) {
      case 'In Transit':
        return [
          {
            label: 'Move to Received',
            action: 'move_to_received',
            status: 'Received',
            disabled: false,
          },
          {
            label: 'Cancel Order',
            action: 'move_to_cancelled',
            status: 'Cancelled',
            disabled: false,
          },
        ]
      case 'Received':
        return [
          {
            label: 'Move to Offer Sent',
            action: 'move_to_offer_sent',
            status: 'Offer Sent',
            disabled: !allItemsConfirmed,
          },
          {
            label: 'Back to In Transit',
            action: 'move_to_in_transit',
            status: 'In Transit',
            disabled: false,
          },
          {
            label: 'Cancel Order',
            action: 'move_to_cancelled',
            status: 'Cancelled',
            disabled: false,
          },
        ]
      case 'Offer Sent':
        return [
          {
            label: 'Move to Accepted',
            action: 'move_to_accepted',
            status: 'Accepted',
            disabled: false,
          },
          {
            label: 'Move to Rejected',
            action: 'move_to_rejected',
            status: 'Rejected',
            disabled: false,
          },
          {
            label: 'Back to Received',
            action: 'move_to_received',
            status: 'Received',
            disabled: false,
          },
        ]
      case 'Accepted':
        return [
          {
            label: 'Move to Payment Processing',
            action: 'move_to_payment_processing',
            status: 'Payment Processing',
            disabled: false,
          },
          {
            label: 'Back to Offer Sent',
            action: 'move_to_offer_sent',
            status: 'Offer Sent',
            disabled: !allItemsConfirmed,
          },
          {
            label: 'Cancel Order',
            action: 'move_to_cancelled',
            status: 'Cancelled',
            disabled: false,
          },
        ]
      case 'Rejected':
        return [
          {
            label: 'Update Offer',
            action: 'update_rejected_offer',
            status: 'Rejected',
            disabled: false,
          },
          {
            label: 'Cancel Order',
            action: 'move_to_cancelled',
            status: 'Cancelled',
            disabled: false,
          },
          {
            label: 'Back to Offer Sent',
            action: 'move_to_offer_sent',
            status: 'Offer Sent',
            disabled: !allItemsConfirmed,
          },
        ]
      case 'Payment Processing':
        return [
          {
            label: 'Move to Completed',
            action: 'move_to_completed',
            status: 'Completed',
            disabled: false,
          },
          {
            label: 'Back to Accepted',
            action: 'move_to_accepted',
            status: 'Accepted',
            disabled: false,
          },
          {
            label: 'Cancel Order',
            action: 'move_to_cancelled',
            status: 'Cancelled',
            disabled: false,
          },
        ]
      case 'Cancelled':
        return [
          {
            label: 'Reopen Order',
            action: 'move_to_received',
            status: 'Received',
            disabled: false,
          },
        ]
      case 'Completed':
        return [
          {
            label: 'Back to Payment Processing',
            action: 'move_to_payment_processing',
            status: 'Payment Processing',
            disabled: false,
          },
        ]
      default:
        return []
    }
  }

  const buttons = getButtonActions()
  const status = statusConfig[order.purchase_order_status]

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
