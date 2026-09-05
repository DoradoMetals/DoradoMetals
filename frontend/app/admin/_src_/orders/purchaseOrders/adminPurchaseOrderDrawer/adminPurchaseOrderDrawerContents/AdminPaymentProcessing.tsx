'use client'

import { Amount, Divider } from '@dorado/components'
import { payoutMethodIcon, PayoutMethodType } from '@/shared/types/payouts'
import { usePaymentMethods } from '@dorado/client'
import { usePaymentDetailsBank } from '@dorado/client'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/shared/types/purchaseOrders'
import RefinerValues from './editRefinerValues'
import ActualsEditor from './editActualValues'

export default function AdminPaymentProcessingPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // THE PAYOUT COMES WITH THE VIEW. It was a read of its own beside a view
  // that already carries `OrderViewPayout` - the method, the holder and the
  // two last-fours - which is a second request for data in hand.
  const payout = view.payout
  const config = statusConfig[order.status ?? '']
  // The client-side option list (icon, label, expected delay) is UI
  // vocabulary, not a column - matched on the row's method.
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const payoutOption = payoutMethods.find((p) => p.type === payout?.method)
  const Icon = payoutOption ? payoutMethodIcon[payoutOption.type as PayoutMethodType] : undefined

  // Bank details are not carried by the order payload. Fetch them only for the
  // two methods that need them, and only while this drawer is open.
  const needsBankDetails =
    payout?.method === 'ACH' || payout?.method === 'WIRE'
  // Payout-keyed: GET /payouts/:id/details takes the payout's own id off the
  // order wire.
  const { data: bank, isLoading: bankLoading } = usePaymentDetailsBank(payout?.id, needsBankDetails)
  const show = (value: string | null | undefined) =>
    bankLoading ? 'loading…' : (value ?? '—')

  return (
    <div className="flex flex-col items-center w-full gap-4 h-full">
      <div className="h-auto w-full p-4 rounded-lg flex flex-col gap-3 border border-border">
        <div className="flex flex-col items-start gap-4 w-full">
          <div className="flex w-full items-center justify-between">
            <strong className="flex items-center gap-1 stat-sm">
              <Icon size={24} />
              {payoutOption?.label}
            </strong>
            <strong className="stat-sm">
              <Amount value={view.totals?.total ?? 0} />
            </strong>
          </div>

          <div className="w-full">
            {payout?.method === 'ACH' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Type:</p>
                    <p>Bank:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{payout?.account_holder_name}</p>
                    <p>{payout?.account_type}</p>
                    <p>{payout?.bank_name}</p>
                    <p>{show(bank?.routing_number)}</p>
                    <p>{show(bank?.account_number)}</p>
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
                    <p>{show(bank?.routing_number)}</p>
                    <p>{show(bank?.account_number)}</p>
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
      </div>
      <Divider />
      <RefinerValues view={view} />
      <Divider />
      <ActualsEditor view={view} />
    </div>
  )
}
