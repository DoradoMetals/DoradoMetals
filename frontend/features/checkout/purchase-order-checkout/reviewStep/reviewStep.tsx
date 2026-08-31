'use client'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { Button } from '@/shared/ui/base/button'
import { formatPickupDateShort, formatPickupTime, formatTimeDiff } from '@/shared/utils/formatDates'
import ItemTables from './itemTable'
import { purchaseOrderCheckoutSchema } from '@/features/orders/purchaseOrders/types'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useCreatePurchaseOrder } from '@/features/orders/purchaseOrders/users/queries'
import { DetailRow } from '@/shared/ui/DetailRow'

export default function ReviewStep() {
  const data = usePurchaseOrderCheckoutStore((state) => state.data)
  const createPurchaseOrder = useCreatePurchaseOrder()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex w-full items-center justify-between">
          <h3>{data.user_address?.label}</h3>
          <p>{formatPhoneNumber(data.address?.phone_number ?? '')}</p>
        </div>

        <p className="mt-2">
          {data.address?.line_1} {data.address?.line_2} <br /> {data.address?.city},{' '}
          {data.address?.state} {data.address?.zip}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between items-center">
          <h3>{data.service?.serviceDescription ?? 'Shipping Service'}</h3>
          <p>{formatTimeDiff(data.service?.transitTime ?? new Date())}</p>
        </div>

        <div className="mt-4 flex justify-between">
          <strong>{data.package?.label}</strong>
          <small>
            {data.package?.dimensions &&
              `${Math.round(data.package.dimensions.height)} × ${Math.round(
                data.package.dimensions.width
              )} × ${Math.round(data.package.dimensions.length)} in`}
          </small>
        </div>

        <div className="mt-1 flex justify-between items-center">
          <strong>{data.pickup?.name}</strong>
          {data.pickup?.name === 'Carrier Pickup' ? (
            <small>
              {formatPickupTime(data.pickup?.time)} on {formatPickupDateShort(data.pickup?.date)}
            </small>
          ) : (
            <Button variant="tertiary" size="sm">
              Find Store
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between">
          <h3>
            {
              {
                ACH: 'ACH',
                WIRE: 'Wire',
                ECHECK: 'eCheck',
                DORADO_ACCOUNT: 'Dorado Account',
              }[data.payout?.method ?? 'ACH']
            }
          </h3>
          <div>
            {data.payout?.method === 'ACH' || data.payout?.method === 'WIRE' ? (
              <p className="mb-3">
                {data.payout.bank_name}{' '}
                {data.payout?.method === 'ACH' ? data.payout.account_type : ''}
              </p>
            ) : null}
          </div>
        </div>

        {(data.payout?.method === 'ACH' || data.payout?.method === 'WIRE') && (
          <>
            <div className="flex flex-col gap-1">
              <DetailRow label="Account Holder:">{data.payout.account_holder_name}</DetailRow>
              <DetailRow label="Routing Number:">{data.payout.routing_number}</DetailRow>
              <DetailRow label="Account Number:">{data.payout.account_number}</DetailRow>
            </div>
          </>
        )}

        {data.payout?.method === 'ECHECK' ||
          (data.payout?.method === 'DORADO_ACCOUNT' && (
            <div className="flex flex-col gap-1 mt-3">
              <DetailRow label="Name:">{data.payout.account_holder_name}</DetailRow>
              <DetailRow label="Email:">{data.payout.payout_email}</DetailRow>
            </div>
          ))}
      </div>

      <ItemTables />

      <Button
        className="w-full mt-2"
        disabled={createPurchaseOrder.isPending}
        onClick={() => {
          const liveCartItems = sellCartStore.getState().items
          const checkoutPayload = {
            ...data,
            items: liveCartItems,
          }

          try {
            const validated = purchaseOrderCheckoutSchema.parse(checkoutPayload)

            createPurchaseOrder.mutate(validated, {
              onSuccess: async () => {
                startTransition(() => {
                  router.push('/order-placed')
                })
                sellCartStore.getState().clearCart()
                usePurchaseOrderCheckoutStore.getState().clear()
              },
            })
          } catch (err) {
            console.error('Invalid purchase order data', err)
          }
        }}
      >
        {createPurchaseOrder.isPending || isPending ? 'Placing Order…' : 'Confirm and Place Order'}
      </Button>
    </div>
  )
}
