'use client'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import { formatPickupDateShort, formatPickupTime, formatTimeDiff } from '@/utils/dateFormatting'
import ItemTables from './itemTable'

export default function ReviewStep() {
  const data = usePurchaseOrderCheckoutStore((state) => state.data)

  return (
    <div className="flex flex-col gap-4 w-full text-sm text-neutral-800">
      {/* Address */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex w-full items-center justify-between">
          <div className="text-xl text-neutral-800">{data.address?.name}</div>
          <div className="text-base text-neutral-600">
            {formatPhoneNumber(data.address?.phone_number ?? '')}
          </div>
        </div>

        <div className="mt-2 leading-snug">
          {data.address?.line_1} {data.address?.line_2} <br /> {data.address?.city},{' '}
          {data.address?.state} {data.address?.zip}
        </div>
      </div>

      {/* Shipment */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="text-xl text-neutral-800">
            {data.service?.serviceDescription ?? 'Shipping Service'}

          </div>
          <div className="text-sm font-normal text-neutral-600">
              {formatTimeDiff(data.service?.transitTime ?? new Date())}
            </div>
          {/* <div className="text-base text-neutral-600">
            <PriceNumberFlow value={data.service?.netCharge ?? 0} />
          </div> */}
        </div>

        <div className="mt-4 flex justify-between">
          <span className="text-neutral-800">{data.package?.label}</span>
          <span className="text-neutral-600">
            {data.package?.dimensions &&
              `${Math.round(data.package.dimensions.height)} × ${Math.round(
                data.package.dimensions.width
              )} × ${Math.round(data.package.dimensions.length)} in`}
          </span>
        </div>

        <div className="mt-1 flex justify-between items-center">
          <span className="text-neutral-800">{data.pickup?.name}</span>
          {data.pickup?.name === 'Carrier Pickup' ? (
            <span className="text-neutral-600">
              {formatPickupTime(data.pickup?.time)} on {formatPickupDateShort(data.pickup?.date)}
            </span>
          ) : (
            <Button variant="ghost" className="h-auto p-0 text-primary text-sm">
              Find Store
            </Button>
          )}
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between">
          <div className="text-xl font-medium">
            {
              {
                ACH: 'ACH',
                WIRE: 'Wire',
                ECHECK: 'eCheck',
              }[data.payout?.method ?? 'ACH']
            }
          </div>
          <div className="text-base text-neutral-600">
            {data.payout?.method === 'ACH' || data.payout?.method === 'WIRE' ? (
              <div className="text-neutral-600 mb-3">
                {data.payout.bank_name} {data.payout?.method === 'ACH' ? data.payout.account_type : ''}
              </div>
            ) : null}
          </div>
        </div>

        {(data.payout?.method === 'ACH' || data.payout?.method === 'WIRE') && (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">Account Holder:</span>
                <span className="text-neutral-800">{data.payout.account_holder_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Routing Number:</span>
                <span className="text-neutral-800">{data.payout.routing_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Account Number:</span>
                <span className="text-neutral-800">{data.payout.account_number}</span>
              </div>
            </div>
          </>
        )}

        {data.payout?.method === 'ECHECK' && (
          <div className='flex flex-col gap-1 mt-3 text-sm'>
            <div className="flex justify-between">
              <span className="text-neutral-600">Name:</span>
              <span className="text-neutral-800">{data.payout.payout_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Email:</span>
              <span className="text-neutral-800">{data.payout.payout_email}</span>
            </div>
          </div>
        )}
      </div>

      <ItemTables />

      <Button className="w-full shadow-lg mt-2">Confirm and Place Order</Button>
    </div>
  )
}
