import { payoutMethodIcon, PayoutMethodType } from '@/shared/types/payouts'
import { usePaymentMethods } from '@dorado/client'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'

export default function PaymentProcessingPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // THE PAYOUT COMES WITH THE VIEW. It was a read of its own beside a view
  // that already carries `OrderViewPayout` - the method, the holder and the
  // two last-fours - which is a second request for data in hand.
  const payout = view.payout
  // The client-side option list (icon, label, expected delay) is UI
  // vocabulary, not a column - matched on the row's method.
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const payoutOption = payoutMethods.find((p) => p.type === payout?.method)
  const Icon = payoutOption ? payoutMethodIcon[payoutOption.type as PayoutMethodType] : undefined

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      <div className="h-auto w-full p-4 rounded-lg flex flex-col gap-3 border border-border">
        <div className="flex flex-col items-start gap-4 w-full">
          <div className="flex w-full items-center justify-between">
            <strong className="flex items-center gap-1 stat-sm">
              {Icon && <Icon size={24} />}
              {payoutOption?.label}
            </strong>
            <small>{payoutOption?.time_delay}</small>
          </div>

          <div className="w-full">
            {payout?.method === 'ACH' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{payout?.account_holder_name}</p>
                    <p>••••{payout?.routing_last4}</p>
                    <p>••••{payout?.account_last4}</p>
                  </div>
                </div>
              </div>
            )}

            {payout?.method === 'WIRE' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{payout?.account_holder_name}</p>
                    <p>••••{payout?.routing_last4}</p>
                    <p>••••{payout?.account_last4}</p>
                  </div>
                </div>
              </div>
            )}

            {payout?.method === 'ECHECK' && (
              <div className="w-full items-center flex justify-between">
                <div className="flex flex-col w-full gap-2 w-full">
                  <div className="flex justify-between w-full items-center">
                    <div className="flex flex-col text-left">
                      <p>Name:</p>
                      <p>Email:</p>
                    </div>
                    <div className="flex flex-col text-right">
                      <p>{payout?.account_holder_name}</p>
                      <p>{payout?.email_to}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {payout?.method === 'DORADO_ACCOUNT' && (
              <div className="w-full items-center flex justify-between">
                <div className="flex flex-col w-full gap-2 w-full">
                  <div className="flex justify-between w-full items-center">
                    <div className="flex flex-col text-left">
                      <p>Name:</p>
                      <p>Email:</p>
                    </div>
                    <div className="flex flex-col text-right">
                      <p>{payout?.account_holder_name}</p>
                      <p>{payout?.email_to}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          {payout?.method === 'ACH' && (
            <p>
              Once we have initiated your ACH transfer, you will receive it within{' '}
              {payoutOption?.time_delay}. If you have entered the wrong routing or account number,
              please call us immediately. We are not liable for missing payments due to incorrect
              input.
            </p>
          )}

          {payout?.method === 'WIRE' && (
            <p>
              Once we have initiated your wire transfer, you will receive it within
              {payoutOption?.time_delay}. If you have entered the wrong routing or account number,
              please call us immediately. We are not liable for missing payments due to incorrect
              input.
            </p>
          )}

          {payout?.method === 'ECHECK' && (
            <p>
              When we send you your eCheck, you will receive it instantly. You will be able to find
              it in your email inbox, and we will have it available for download here as well.
            </p>
          )}

          {payout?.method === 'DORADO_ACCOUNT' && (
            <p>
              Your funds should now be available. You can use those funds to purchase bullion from
              us, and they can be withdrawn and sent to you via one of the other payout methods at
              any time. You can see your total available balance in your account.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
