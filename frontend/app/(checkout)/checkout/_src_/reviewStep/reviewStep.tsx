'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@dorado/components'
import type { CarrierHandoff, CheckoutRate, CheckoutView, FulfillmentView } from '@dorado/contracts'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { formatPickupDateShort, formatPickupTime, formatTimeDiff } from '@/shared/utils/formatDates'
import ItemTables from './itemTable'
import { useAddress, useUserAddresses } from '@/shared/hooks/addresses/queries'
import { useOfferedPackages, usePlaceOrderFromCheckout } from '@/shared/hooks/checkout/queries'
import { usePayoutDraft } from '../payoutStep/payoutDraft'
import { readyToPlace } from '@/shared/utils/gates'

const PAYOUT_LABEL: Record<string, string> = {
  ACH: 'ACH',
  WIRE: 'Wire',
  ECHECK: 'eCheck',
  DORADO_ACCOUNT: 'Dorado Account',
}

// EVERYTHING ON THIS SCREEN IS THE ROW'S, except the bank form - which the
// server sealed at the payout step and deliberately never returns, so the
// unsent draft is the only place the last four digits can be read from.
// THE PARCEL'S CHOICES ARE THE DRAFT FULFILLMENT'S (rulings 69/70, migration
// 128): the box, the origin address and the courier slot are read off
// `fulfillment.parcel`, and `handoff` is resolved from the draft's own method
// type (gates.ts `resolveHandoff`).
export default function ReviewStep({
  row,
  fulfillment,
  rates,
  handoff,
}: {
  row?: CheckoutView
  fulfillment?: FulfillmentView
  rates: CheckoutRate[]
  handoff: CarrierHandoff | null
}) {
  const placeOrder = usePlaceOrderFromCheckout('purchase')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const { data: addresses = [] } = useAddress()
  const { data: links = [] } = useUserAddresses()
  const { data: packages = [] } = useOfferedPackages()
  const payout = usePayoutDraft((state) => state.payout)
  const clearPayout = usePayoutDraft((state) => state.clear)

  const parcel = fulfillment?.parcel
  const address = addresses.find((a) => a.id === parcel?.shipper_address_id)
  const link = links.find((l) => l.address_id === parcel?.shipper_address_id)
  const box = packages.find((p) => p.id === parcel?.package_id)
  const service = rates.find((r) => r.selected)

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex w-full items-center justify-between">
          <h3>{link?.label}</h3>
          <p>{formatPhoneNumber(address?.phone_number ?? '')}</p>
        </div>

        <p className="mt-2">
          {address?.line_1} {address?.line_2} <br /> {address?.city}, {address?.state}{' '}
          {address?.zip}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between items-center">
          <h3>{service?.name ?? 'Shipping Service'}</h3>
          {service?.transitTime && <p>{formatTimeDiff(new Date(service.transitTime))}</p>}
        </div>

        {/* RULING 58: the box's dimensions are the server's - the parcel holds
            the id and the catalogue supplies the label. */}
        <div className="mt-4 flex justify-between">
          <strong>{box?.label}</strong>
        </div>

        <div className="mt-1 flex justify-between items-center">
          {handoff?.requires_schedule ? (
            <>
              <strong>Carrier Pickup</strong>
              <small>
                {formatPickupTime(parcel?.pickup_time ?? undefined)} on{' '}
                {formatPickupDateShort(parcel?.pickup_date ?? undefined)}
              </small>
            </>
          ) : (
            <>
              <strong>Carrier Drop-off</strong>
              <Button variant="tertiary" size="sm">
                Find Store
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex justify-between">
          <h3>{PAYOUT_LABEL[payout?.method ?? 'ACH']}</h3>
          <div>
            {payout?.method === 'ACH' || payout?.method === 'WIRE' ? (
              <p className="mb-3">
                {payout.bank_name} {payout.method === 'ACH' ? payout.account_type : ''}
              </p>
            ) : null}
          </div>
        </div>

        {(payout?.method === 'ACH' || payout?.method === 'WIRE') && (
          <div className="flex flex-col gap-1">
            <div className="flex w-full items-center justify-between gap-2">
              <p>Account Holder:</p>
              <strong>{payout.account_holder_name}</strong>
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <p>Routing Number:</p>
              <strong>{payout.routing_number}</strong>
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <p>Account Number:</p>
              <strong>{payout.account_number}</strong>
            </div>
          </div>
        )}

        {(payout?.method === 'ECHECK' || payout?.method === 'DORADO_ACCOUNT') && (
          <div className="flex flex-col gap-1 mt-3">
            <div className="flex w-full items-center justify-between gap-2">
              <p>Name:</p>
              <strong>{payout.account_holder_name}</strong>
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <p>Email:</p>
              <strong>{payout.payout_email}</strong>
            </div>
          </div>
        )}
      </div>

      <ItemTables row={row} rates={rates} />

      {message && <p className="text-destructive">{message}</p>}
      <Button
        className="w-full mt-2"
        // The server's own answer to "is this order placeable" - `missing`
        // names every column it still needs, including the sealed payout
        // account, and `readyToPlace` is that list being empty.
        disabled={placeOrder.isPending || !row || !readyToPlace(row.missing)}
        onClick={() => {
          // ONE ID (D210). Every choice is already a server-side resource; the
          // click carries the checkout's id and nothing else.
          setMessage(null)
          placeOrder.mutate(undefined, {
            onSuccess: () => {
              // The basket is emptied by the placement itself (place.ts clears
              // the purchase basket after the label is bought), and the client
              // package invalidates the query - so nothing here clears rows.
              startTransition(() => router.push('/order-placed'))
              clearPayout()
            },
            onError: (err) =>
              setMessage(
                err.message ||
                  'The order could not be placed. Nothing has been charged - please try again.'
              ),
          })
        }}
      >
        {placeOrder.isPending || isPending ? 'Placing Order…' : 'Confirm and Place Order'}
      </Button>
    </div>
  )
}
