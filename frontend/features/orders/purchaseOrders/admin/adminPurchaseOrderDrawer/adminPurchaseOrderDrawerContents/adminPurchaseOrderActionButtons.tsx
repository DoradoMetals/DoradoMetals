import { Button } from '@/shared/ui/base/button'
import { PurchaseOrderActionButtonsProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { cn } from '@/shared/utils/cn'
import { useMemo } from 'react'
import { usePatchOrder } from '@/features/orders/patch'

export function PurchaseOrderActionButtons({ order }: PurchaseOrderActionButtonsProps) {
  const patchOrder = usePatchOrder()

  const handleAction = (action: string, status: string) => {
    // STATUS IS A PURE LABEL - the pipelines are explicit ops in the same
    // document, applied before the label lands:
    //
    // - finalize_pricing runs the pricing pipeline SERVER-side (the server
    //   resolves the frozen and live spots itself - the browser's pricing
    //   arrays no longer exist to send), and the label it advances to is
    //   sent alongside: offers left the product entirely, so finalizing a
    //   Received order lands it straight in 'Payment Processing'.
    // - completing a DORADO_ACCOUNT payout credits the customer's funds;
    //   add_funds rides the same document, applied before status - the same
    //   order the two legacy requests raced to keep.
    const addFunds = status === 'Completed' && order.payout.method === 'DORADO_ACCOUNT'
    patchOrder.mutate({
      id: order.id,
      patch: {
        ...(action === 'finalize_pricing' ? { finalize_pricing: true as const } : null),
        ...(addFunds ? { add_funds: true } : null),
        status,
      },
    })
  }

  const allItemsConfirmed = useMemo(() => {
    return order.order_items.every((item) => item.confirmed)
  }, [order.order_items])

  const getButtonActions = () => {
    switch (order.status) {
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
            label: 'Finalize Pricing',
            action: 'finalize_pricing',
            status: 'Payment Processing',
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
      case 'Payment Processing':
        return [
          {
            label: 'Move to Completed',
            action: 'move_to_completed',
            status: 'Completed',
            disabled: false,
          },
          {
            label: 'Back to Received',
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
