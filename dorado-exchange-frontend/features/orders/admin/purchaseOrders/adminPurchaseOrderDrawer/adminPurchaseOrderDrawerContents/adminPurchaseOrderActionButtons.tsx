import { Button } from '@/shared/ui/base/button'
import { PurchaseOrderActionButtonsProps, statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'
import {
  useAcceptOffer,
  useAddFundsToAccount,
  useMovePurchaseOrderStatus,
  useRejectOffer,
  useSendOffer,
  useUpdateRejectedOffer,
} from '@/lib/queries/admin/useAdminPurchaseOrders'
import { useMemo } from 'react'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'

export function PurchaseOrderActionButtons({ order }: PurchaseOrderActionButtonsProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const movePurchaseOrderStatus = useMovePurchaseOrderStatus()
  const acceptOffer = useAcceptOffer()
  const rejectOffer = useRejectOffer()
  const sendOffer = useSendOffer()
  const updateRejected = useUpdateRejectedOffer()
  const addAccountFunds = useAddFundsToAccount()

  const handleAction = (action: string, status: string) => {
    if (action === 'accept_offer') {
      acceptOffer.mutate({
        purchase_order: order,
        order_spots: orderSpotPrices,
        spot_prices: spotPrices,
      })
    } else if (action === 'reject_offer') {
      rejectOffer.mutate({ purchase_order: order, offer_notes: '' })
    } else if (action === 'update_rejected_offer') {
      updateRejected.mutate({ order_status: status, order: order })
    } else if (action === 'send_offer') {
      sendOffer.mutate({
        order_status: status,
        order: order,
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
            action: 'send_offer',
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
            label: 'Accept Offer for Customer',
            action: 'accept_offer',
            status: 'Accepted',
            disabled: false,
          },
          {
            label: 'Reject Offer for Customer',
            action: 'reject_offer',
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
            action: 'send_offer',
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
            action: 'send_offer',
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
