'use client'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import {
  formatPickupDate,
  formatPickupDateShort,
  formatPickupTime,
  formatTimeDiff,
} from '@/utils/dateFormatting'
import { calculateVolume } from '@/types/packaging'

export default function ReviewStep() {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const data = usePurchaseOrderCheckoutStore((state) => state.data)

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between w-full mb-6">
          <h2 className="text-xs text-neutral-600 tracking-widest">Address</h2>
          <span className="text-base text-neutral-900 font-medium">{data.address?.name}</span>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between w-full">
            <span className="text-neutral-700">Phone:</span>
            <span className="text-neutral-800">
              {formatPhoneNumber(data.address?.phone_number ?? '')}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-neutral-700">Street:</span>
            <span className="text-neutral-800">
              {data.address?.line_1}
              {data.address?.line_2 ? ` ${data.address.line_2}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-neutral-700">City:</span>
            <span className="text-neutral-800">{data.address?.city}</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-neutral-700">State:</span>
            <span className="text-neutral-800">{data.address?.state}</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-neutral-700">ZIP Code:</span>
            <span className="text-neutral-800">{data.address?.zip}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-border bg-card p-3">
        <div className="flex w-full justify-between">
          <h2 className="text-xs text-neutral-600 tracking-widest mb-6">Shipment</h2>
          <div className="text-base text-neutral-900 font-medium">
            <PriceNumberFlow value={data.service?.netCharge ?? 0} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between w-full text-neutral-800">
            <div>{data.package?.label}</div>
            <div>
              {data.package?.dimensions && (
                <div className="text-neutral-700 text-sm">
                  {Math.round(data.package.dimensions.height)} ×{' '}
                  {Math.round(data.package.dimensions.width)} ×{' '}
                  {Math.round(data.package.dimensions.length)} in
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between w-full text-neutral-800">
            <div>{data.service?.serviceDescription}</div>
            <div className="text-neutral-700 text-sm">
              {formatTimeDiff(data.service?.transitTime ?? new Date())}
            </div>
          </div>
          <div className="flex items-center justify-between w-full text-neutral-800">
            <div>{data.pickup?.name}</div>
            {data.pickup?.name === 'Carrier Pickup' ? (
              <div className="text-neutral-700 text-sm">
                {formatPickupTime(data.pickup?.time)} - {formatPickupDateShort(data.pickup?.date)}
              </div>
            ) : (
              <div>
                <Button variant="ghost" className="text-primary p-0">
                  Find Store
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col rounded-lg border border-border bg-card p-3">
        <div className="flex w-full justify-between">
          <h2 className="text-xs text-neutral-600 tracking-widest mb-6">Payment</h2>
          <span className="text-base text-neutral-900 font-medium">
            {
              {
                ACH: 'ACH',
                WIRE: 'Wire',
                ECHECK: 'eCheck',
              }[data.payout?.method ?? 'ACH']
            }
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {data.payout?.method === 'ACH' || data.payout?.method === 'WIRE' ? (
            <>
              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm">Name:</span>
                <span className="text-neutral-800">{data.payout.account_holder_name}</span>
              </div>

              {data.payout?.method === 'ACH' && (
                <div className="flex items-center justify-between w-full">
                  <span className="text-neutral-700 text-sm">Account Type:</span>
                  <span className="text-neutral-800">{data.payout.account_type}</span>
                </div>
              )}

              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm ">Bank Name:</span>
                <span className="text-neutral-800">{data.payout.bank_name}</span>
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm">Account Number:</span>
                <span className="text-neutral-800">{data.payout.account_number}</span>
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm">Routing Number:</span>
                <span className="text-neutral-800">{data.payout.routing_number}</span>
              </div>
            </>
          ) : data.payout?.method === 'ECHECK' ? (
            <>
              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm">Name:</span>
                <span className="text-neutral-800">{data.payout.payout_name}</span>
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-neutral-700 text-sm">Email:</span>
                <span className="text-neutral-700">{data.payout.payout_email}</span>
              </div>
            </>
          ) : (
            <div className="text-neutral-600 italic">No payout method selected.</div>
          )}
        </div>
      </div>
      <Button className="w-full shadow-lg">Confirm and Place Order</Button>
    </div>
  )
}
