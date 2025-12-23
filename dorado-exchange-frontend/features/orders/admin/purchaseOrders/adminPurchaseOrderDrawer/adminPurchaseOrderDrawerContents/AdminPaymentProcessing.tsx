import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import RefinerValues from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editRefinerValues'
import ActualsEditor from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editActualValues'


export default function AdminPaymentProcessingPurchaseOrder({
  order,
}: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const payout = payoutOptions.find((p) => p.method === order.payout?.method)
  const Icon = payout?.icon

  return (
    <div className="flex flex-col items-center w-full gap-4 h-full">
      <div className="h-auto w-full p-4 rounded-lg flex flex-col gap-3 raised-off-page bg-card">
        <div className="flex flex-col items-start gap-4 w-full">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1 text-xl text-neutral-800">
              <Icon size={24} className={config.text_color} />
              {payout?.label}
            </div>
            <div className="text-xl text-neutral-900">
              <PriceNumberFlow value={order.total_price ?? 0} />
            </div>
          </div>

          <div className="w-full">
            {order.payout.method === 'ACH' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full text-base text-neutral-800 items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Type:</p>
                    <p>Bank:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{order.payout.account_holder_name}</p>
                    <p>{order.payout.account_type}</p>
                    <p>{order.payout.bank_name}</p>
                    <p>{order.payout.routing_number}</p>
                    <p>{order.payout.account_number}</p>
                  </div>
                </div>
              </div>
            )}

            {order.payout.method === 'WIRE' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full text-base text-neutral-800 items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{order.payout.account_holder_name}</p>
                    <p>{order.payout.routing_number}</p>
                    <p>{order.payout.account_number}</p>
                  </div>
                </div>
              </div>
            )}

            {order.payout.method === 'ECHECK' && (
              <div className="w-full items-center flex justify-between">
                <div className="flex flex-col w-full gap-2 w-full">
                  <div className="flex justify-between w-full text-base text-neutral-800 items-center">
                    <div className="flex flex-col text-left">
                      <p>Name:</p>
                      <p>Email:</p>
                    </div>
                    <div className="flex flex-col text-right">
                      <p>{order.payout.account_holder_name}</p>
                      <p>{order.payout.email_to}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {order.payout.method === 'DORADO_ACCOUNT' && (
              <div className="w-full items-center flex justify-between">
                <div className="flex flex-col w-full gap-2 w-full">
                  <div className="flex justify-between w-full text-base text-neutral-800 items-center">
                    <div className="flex flex-col text-left">
                      <p>Name:</p>
                      <p>Email:</p>
                    </div>
                    <div className="flex flex-col text-right">
                      <p>{order.payout.account_holder_name}</p>
                      <p>{order.payout.email_to}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="separator-inset" />
      <RefinerValues order={order} />
      <div className="separator-inset" />
      <ActualsEditor order={order} />
    </div>
  )
}
