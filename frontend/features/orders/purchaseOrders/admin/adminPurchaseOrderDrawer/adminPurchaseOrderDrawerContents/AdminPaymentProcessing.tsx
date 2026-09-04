'use client'

import { Divider } from '@dorado/components'
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import { usePaymentMethods } from '@dorado/client'
import { usePayoutDetails } from '@dorado/client'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import RefinerValues from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editRefinerValues'
import ActualsEditor from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editActualValues'
import { useOrderPayouts } from '@dorado/client'

export default function AdminPaymentProcessingPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for the order's payout (ruling 14). The composed wire carried
  // a `payout` member that was an OBJECT OF NULLS when the order had none - a
  // LEFT JOIN feeding jsonb_build_object - so `payout?.method` read
  // `undefined` rather than throwing. It is its own read now, last-four only,
  // and an order with no payout answers [].
  const { data: payouts = [] } = useOrderPayouts(order.id)
  const payout = payouts[0] ?? null
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
  const { data: bank, isLoading: bankLoading } = usePayoutDetails(
    payout?.id,
    needsBankDetails
  )
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
              <PriceNumberFlow value={view.totals?.total ?? 0} />
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
