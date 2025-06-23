import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { useCancelPaymentIntent, useGetSalesOrderPaymentIntent } from '@/lib/queries/useStripe'
import { SalesOrderDrawerContentProps } from '@/types/sales-orders'

export default function AdminPendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: paymentIntent } = useGetSalesOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent()

  return (
    <>
      {paymentIntent && (
        <div className="relative flex flex-col gap-4 h-full rounded-lg">
          <div className="flex items-center w-full justify-between">
            <div className="text-xl text-neutral-800">Awaiting Payment of:</div>
            <div className="text-xl text-neutral-800">
              <PriceNumberFlow
                value={order.post_charges_amount - (paymentIntent.amount_received / 100)}
              />
            </div>
          </div>
          <div className="flex items-center w-full justify-between">
            <div className="text-xl text-neutral-800">Payment Method:</div>
            <div className="text-xl text-neutral-800">
              {paymentIntent?.method_type
                ?.toLowerCase()
                .replace(/_/g, ' ')
                .replace(/^\w/, (c) => c.toUpperCase())}
            </div>
          </div>
          <div className="flex items-center w-full justify-between">
            <div className="text-xl text-neutral-800">Payment Status:</div>
            <div className="text-xl text-neutral-800">
              {paymentIntent?.payment_status
                ?.toLowerCase()
                .replace(/_/g, ' ')
                .replace(/^\w/, (c) => c.toUpperCase())}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
