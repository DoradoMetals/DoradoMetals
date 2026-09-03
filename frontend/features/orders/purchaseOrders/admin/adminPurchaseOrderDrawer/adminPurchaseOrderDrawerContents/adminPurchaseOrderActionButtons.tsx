import { useOrderPayouts } from '@/features/payouts/queries'
import { useOrderItems } from '@/features/orders/reads'
import { Button } from '@dorado/components'
import { PurchaseOrderActionButtonsProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { cn } from '@/shared/utils/cn'
import { useMemo } from 'react'
import { usePatchOrder, useAddFundsToOrder, useFinalizeOrderPricing } from '@/features/orders/patch'

export function PurchaseOrderActionButtons({ order }: PurchaseOrderActionButtonsProps) {
  // A CONTAINER for the order's payout (ruling 14). The composed wire carried
  // a `payout` member that was an OBJECT OF NULLS when the order had none - a
  // LEFT JOIN feeding jsonb_build_object - so `payout.method` read
  // `undefined` rather than throwing. It is its own read now, last-four only,
  // and an order with no payout answers [].
  const { data: items = [] } = useOrderItems(order.id)
  const { data: payouts = [] } = useOrderPayouts(order.id)
  const payout = payouts[0] ?? null
  const patchOrder = usePatchOrder()
  const finalizePricing = useFinalizeOrderPricing()
  const addFundsToOrder = useAddFundsToOrder()

  const handleAction = async (action: string, status: string) => {
    // STATUS IS A PURE LABEL, and it is a SEPARATE call now (D214 item 11):
    // finalize_pricing and add_funds are their own POSTs, neither writes
    // status, so the label change follows once the action has settled.
    //
    // - finalize_pricing runs the pricing pipeline SERVER-side (the server
    //   resolves the frozen and live spots itself - the browser's pricing
    //   arrays no longer exist to send); offers left the product entirely, so
    //   finalizing a Received order lands it straight in 'Payment Processing'.
    // - completing a DORADO_ACCOUNT payout credits the customer's funds
    //   before the status moves to 'Completed'.
    const addFunds = status === 'Completed' && payout?.method === 'DORADO_ACCOUNT'
    try {
      if (action === 'finalize_pricing') {
        await finalizePricing.mutateAsync({ id: order.id })
      }
      if (addFunds) {
        await addFundsToOrder.mutateAsync({ id: order.id })
      }
      patchOrder.mutate({ id: order.id, patch: { status } })
    } catch {
      // The action was refused (e.g. no total to credit) - stay on the
      // current status rather than move the label past a failed step.
    }
  }

  const allItemsConfirmed = useMemo(() => items.every((item) => item.confirmed), [items])

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
            /* Three hand-painted looks became the three EMPHASIS steps
               (ruling 25): the retired `on-glass` / `primary-on-glass` pair
               were both an outlined button, and the third spelled a bare link
               with a hover it then cancelled. */
            variant={isTertiaryStyle ? 'tertiary' : 'secondary'}
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
