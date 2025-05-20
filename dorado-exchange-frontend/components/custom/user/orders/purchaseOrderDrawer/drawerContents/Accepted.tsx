import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { cn } from '@/lib/utils'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function AcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const payout = payoutOptions.find((p) => p.method === order.payout?.method)
  const Icon = payout?.icon
  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full">
      <config.icon className={cn(config.text_color, 'mb-6')} size={128} strokeWidth={1.5} />
      <h2 className="text-2xl text-neutral-800 mb-2">You have accepted our offer!</h2>

      <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-center">
        Our team is working on getting your items settled and will begin processing your payment
        shortly.
      </p>
      <div className="bg-card raised-off-page h-auto w-full p-4 rounded-lg flex flex-col gap-5">
        <div className="flex items-end w-full justify-between">
          <div className="flex items-center gap-1 text-lg text-neutral-800">
            <Icon size={24} className={config.text_color} />
            {payout?.label}
          </div>
          <div className="text-sm text-neutral-700">{payout?.time_delay}</div>
        </div>

        {order.payout.method === 'ACH' && (
          <div className="flex w-full items-end justify-between">
            <div className="flex gap-2 justify-between text-sm text-neutral-700 items-center">
              <div className="flex flex-col">
                <p>To:</p>
                <p>Routing:</p>
                <p>Account:</p>
              </div>
              <div className="flex flex-col">
                <p>{order.payout.account_holder_name}</p>
                <p>{order.payout.routing_number}</p>
                <p>{order.payout.account_number}</p>
              </div>
            </div>
            <div className="text-2xl text-neutral-800">
              <PriceNumberFlow value={order.total_price ?? 0} />
            </div>
          </div>
        )}

        {order.payout.method === 'WIRE' && (
          <div className="flex w-full items-end justify-between">
            <div className="flex gap-2 justify-between text-sm text-neutral-700 items-center">
              <div className="flex flex-col">
                <p>To:</p>
                <p>Routing:</p>
                <p>Account:</p>
              </div>
              <div className="flex flex-col">
                <p>{order.payout.account_holder_name}</p>
                <p>{order.payout.routing_number}</p>
                <p>{order.payout.account_number}</p>
              </div>
            </div>
            <div className="text-2xl text-neutral-800">
              <PriceNumberFlow value={order.total_price ?? 0} />
            </div>
          </div>
        )}

        {order.payout.method === 'ECHECK' && (
          <div className="flex w-full items-end justify-between">
            <div className="flex gap-2 justify-between text-sm text-neutral-700 items-center">
              <div className="flex flex-col">
                <p>To:</p>
                <p>Email:</p>
              </div>
              <div className="flex flex-col">
                <p>{order.payout.account_holder_name}</p>
                <p>{order.payout.email_to}</p>
              </div>
            </div>
            <div className="text-2xl text-neutral-800">
              <PriceNumberFlow value={order.total_price ?? 0} />
            </div>
          </div>
        )}
        
      </div>
    </div>
  )
}
