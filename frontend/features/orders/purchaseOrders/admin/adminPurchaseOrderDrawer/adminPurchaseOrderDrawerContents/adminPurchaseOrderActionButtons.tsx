import { Button } from '@dorado/components'
import { usePatchOrder, useAddFunds, useFinalizePricing } from '@dorado/client'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderActionButtonsProps } from '@/features/orders/purchaseOrders/types'
import { actionLabel } from '@/features/orders/actionLabel'

// WHAT AN ADMIN MAY DO TO A PURCHASE ORDER, RENDERED AND NOT DECIDED.
//
// This component held a `switch (order.status)` returning five hard-coded
// button lists, a `disabled: !allItemsConfirmed` gate it computed from a
// second read, and one real business rule buried in a handler: "completing a
// DORADO_ACCOUNT payout credits the customer's funds first". All three were
// decisions about the business, taken in a browser.
//
// They live in api/domain/orders/rules.ts now and arrive as
// `view.actions` - `statuses` is the gated ladder, and each boolean is an
// endpoint this order can actually answer. Nothing here reads a payout, a
// line or a status to work out what to show.
export function PurchaseOrderActionButtons({ view }: PurchaseOrderActionButtonsProps) {
  const { order, actions } = view
  const patchOrder = usePatchOrder()
  const finalizePricing = useFinalizePricing()
  const addFunds = useAddFunds()

  const busy = patchOrder.isPending || finalizePricing.isPending || addFunds.isPending

  return (
    <div className="flex flex-col w-full gap-2 mt-4">
      {actions.finalize_pricing && (
        <Button
          variant="primary"
          className="w-full"
          disabled={busy}
          onClick={() => finalizePricing.mutate({ id: order.id })}
        >
          Finalize Pricing
        </Button>
      )}

      {/* CREDITING IS ITS OWN BUTTON, not a side effect of reaching
          'Completed'. A status drives no logic (ruling 2), and the rule that
          decides whether this order's payout is a credit at all is the
          server's - `actions.add_funds` is that rule's answer. */}
      {actions.add_funds && (
        <Button
          variant="primary"
          className="w-full"
          disabled={busy}
          onClick={() => addFunds.mutate({ id: order.id })}
        >
          Credit Customer Account
        </Button>
      )}

      {actions.statuses.map((status, index) => (
        <Button
          key={status}
          onClick={() => patchOrder.mutate({ id: order.id, patch: { status } })}
          /* Three hand-painted looks became the three EMPHASIS steps
             (ruling 25). */
          variant={index >= 2 ? 'tertiary' : 'secondary'}
          disabled={busy}
          className={cn('w-full', index >= 2 && 'justify-start')}
        >
          {actionLabel(order.direction, order.status, status)}
        </Button>
      ))}
    </div>
  )
}
