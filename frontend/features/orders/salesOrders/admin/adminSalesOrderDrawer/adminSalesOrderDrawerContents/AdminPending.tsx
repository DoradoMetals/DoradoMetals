import { useCancelPaymentIntent, useGetSalesOrderPaymentIntent } from '@/features/stripe/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { paymentOptions, SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'

export default function AdminPendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: paymentIntent } = useGetSalesOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent(order.id)
  const status = statusConfig[order.sales_order_status]

  // details.type speaks the schema's vocabulary (CARD, ACH), not Stripe's -
  // so the match is on the option's method, where the legacy wire matched its
  // Stripe-spelled value.
  const paymentType = paymentOptions.find((p) => p.method === paymentIntent?.details?.type)
  const Icon = paymentType?.icon
  // The provider's reference lives on the attempt, and is what cancel takes.
  const intentRef = paymentIntent?.attempt?.provider_ref ?? null

  return (
    <>
      {paymentIntent && (
        <div className="flex flex-col gap-4 on-glass rounded-lg h-full p-4">
          <div className="flex items-center w-full justify-between">
            <div className="text-lg text-neutral-800 flex items-center gap-2">
              <Icon size={24} />
              {paymentType?.label}
            </div>
            <div
              className={cn(
                'text-sm p-1 px-2 rounded-lg',
                paymentIntent.status === 'succeeded'
                  ? 'success-on-glass'
                  : paymentIntent.status === 'processing'
                  ? 'primary-on-glass'
                  : 'destructive-on-glass'
              )}
            >
              {paymentIntent.status === 'requires_payment_method'
                ? 'Failed'
                : (paymentIntent.status ?? '')
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
          </div>

          <div className="glass-divider" />

          {paymentIntent.details?.card_brand && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Card Brand:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.details.card_brand
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}

          {paymentIntent.details?.bank_name && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Bank Name:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.details.bank_name
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}

          {paymentIntent.details?.account_type && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">Account Type:</div>
              <div className="text-base text-neutral-800">
                {paymentIntent.details.account_type
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            </div>
          )}
          {paymentIntent.details?.last_four && (
            <div className="flex items-center w-full justify-between">
              <div className="text-base text-neutral-600">
                {paymentType?.method !== 'ACH' ? 'Card Number:' : 'Account Number'}
              </div>
              <div className="text-base text-neutral-800">
                *******{paymentIntent.details.last_four}
              </div>
            </div>
          )}
          {/* No routing number, ever. The legacy wire carried one only because
              the exchange read was SELECT *; the contract has no such field,
              and bank details never render outside the admin payout screen. */}
          <div className="glass-divider" />

          {/* DOLLARS on the wire, not cents - the /100 died with the adapter,
              and putting one back here is a hundredfold error on money. */}
          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Total Due:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow value={Number(paymentIntent.amount_expected ?? 0)} />
            </div>
          </div>

          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Amount Paid:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow value={Number(paymentIntent.amount_received ?? 0)} />
            </div>
          </div>

          <div className="flex items-center w-full justify-between">
            <div className="text-end text-neutral-600">Remaining Balance:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow
                value={
                  Number(paymentIntent.amount_expected ?? 0) -
                  Number(paymentIntent.amount_received ?? 0)
                }
              />
            </div>
          </div>
          <div className="glass-divider" />
          <Button
            className={cn(
              'on-glass hover:border-none',
              'text-primary',
              'hover:bg-primary',
              'border-primary',
              'hover:text-white raised-off-page'
            )}
            onClick={() => intentRef && cancelPaymentIntent.mutate(intentRef)}
            disabled={
              !intentRef ||
              cancelPaymentIntent.isPending ||
              ['canceled', 'succeeded', 'processing'].includes(paymentIntent.status ?? '')
            }
          >
            {cancelPaymentIntent.isPending ? 'Cancelling...' : 'Cancel Payment'}
          </Button>
        </div>
      )}
    </>
  )
}
