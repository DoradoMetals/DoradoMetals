import { cn } from '@/lib/utils'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function PaymentProcessingPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const payout = payoutOptions.find((p) => p.method === order.payout?.method)
  const Icon = payout?.icon

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      <div className="flex flex-col gap-3 w-full">
        <div className="text-left">
          <div className="text-xl text-neutral-800 mb-2">Your payment is processing!</div>
          <div className="text-sm text-neutral-600">
            See below for payment details. If you need to make any
            last minute changes to your payment method, please call us and we will do our best to
            accomodate you.
          </div>
        </div>
      </div>
      <div className="h-auto w-full p-4 rounded-lg flex flex-col gap-3 raised-off-page bg-card">
        <div className="flex flex-col items-start gap-4 w-full">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1 text-xl text-neutral-800">
              <Icon size={24} className={config.text_color} />
              {payout?.label}
            </div>
            <div className={cn('text-sm', config.text_color)}>{payout?.time_delay}</div>
          </div>

          <div className="w-full">
            {order.payout.method === 'ACH' && (
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
          </div>
        </div>
        <div>
          {order.payout.method === 'ACH' && (
            <div className="text-sm text-neutral-600">
              Once we have initiated your ACH transfer, you will receive it within{' '}
              {payout?.time_delay}. If you have entered the wrong routing or account number, please
              call us immediately. We are not liable for missing payments due to incorrect input.
            </div>
          )}

          {order.payout.method === 'WIRE' && (
            <div className="text-sm text-neutral-600">
              Once we have initiated your wire transfer, you will receive it within
              {payout?.time_delay}. If you have entered the wrong routing or account number, please
              call us immediately. We are not liable for missing payments due to incorrect input.
            </div>
          )}

          {order.payout.method === 'ECHECK' && (
            <div className="text-sm text-neutral-600">
              When we send you your eCheck, you will receive it instantly. You will be able to find
              it in your email inbox, and we will have it available for download here as well.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
