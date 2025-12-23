import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import { useCancelPaymentIntent, useGetSalesOrderPaymentIntent } from '@/lib/queries/useStripe'
import { cn } from '@/lib/utils'
import { paymentOptions, SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'

export default function AdminPendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: paymentIntent } = useGetSalesOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent(order.id)
  const status = statusConfig[order.sales_order_status]

  const paymentType = paymentOptions.find((p) => p.value === paymentIntent?.method_type)
  const Icon = paymentType?.icon

  return (
    <>
      {paymentIntent && (
        <div className="flex flex-col gap-4 bg-card raised-off-page rounded-lg h-full p-4">
          <div className="flex items-center w-full justify-between">
            <div className="text-lg text-neutral-800 flex items-center gap-2">
              <Icon size={24} />
              {paymentType?.label}
            </div>
            <div
              className={cn(
                'text-sm p-1 rounded-lg raised-off-page',
                paymentIntent.payment_status === 'succeeded'
                  ? 'text-green-700 bg-green-200/30'
                  : paymentIntent.payment_status === 'processing'
                  ? 'text-yellow-700 bg-yellow-200/30'
                  : 'text-red-700 bg-red-200/30'
              )}
            >
              {paymentIntent?.payment_status === 'requires_payment_method'
                ? 'Failed'
                : paymentIntent?.payment_status
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
          </div>

          <div className="separator-inset" />

          {paymentIntent.card_brand && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Card Brand:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.card_brand
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}

          {paymentIntent.bank_name && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Bank Name:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.bank_name
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}

          {paymentIntent.bank_account_type && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Account Type:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.bank_account_type
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}
          {paymentIntent.last_four && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">
                {paymentType?.method !== 'ACH' ? 'Card Number:' : 'Account Number'}
              </div>
              <div className="text-base text-neutral-800">*******{paymentIntent.last_four}</div>
            </div>
          )}
          {paymentIntent.routing && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Routing Number:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.routing
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}
          <div className="separator-inset" />

          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Total Due:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow value={paymentIntent.amount / 100} />
            </div>
          </div>

          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Amount Paid:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow value={paymentIntent.amount_received / 100} />
            </div>
          </div>

          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Remaining Balance:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow
                value={(paymentIntent.amount - paymentIntent.amount_received) / 100}
              />
            </div>
          </div>
          <div className="separator-inset" />
          <Button
            className={cn(
              'bg-card border hover:border-none',
              status?.text_color,
              status?.hover_background_color,
              status?.border_color,
              'hover:text-white raised-off-page'
            )}
            onClick={() => cancelPaymentIntent.mutate(paymentIntent.payment_intent_id)}
            disabled={
              cancelPaymentIntent.isPending ||
              ['canceled', 'succeeded', 'processing'].includes(paymentIntent.payment_status)
            }
          >
            {cancelPaymentIntent.isPending ? 'Cancelling...' : 'Cancel Payment'}
          </Button>
        </div>
      )}
    </>
  )
}
