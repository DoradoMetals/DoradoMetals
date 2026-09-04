'use client'

import type { CarrierHandoff, CheckoutRate, CheckoutView, FulfillmentView } from '@dorado/contracts'
import type { UserAddress } from '@/features/addresses/types'
import { Button, Divider } from '@dorado/components'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'

import { useCarrierPickupTimes } from '@dorado/client'
import { useCreateFulfillment, usePatchFulfillment } from '@/features/checkout/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useAddress, useUserAddresses } from '@/features/addresses/queries'

import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { PackageSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/packageSelector'
import { ServiceSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/serviceSelector'
import { PickupSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/pickupSelector'
import PickupScheduler from '@/features/checkout/purchase-order-checkout/shippingStep/pickupScheduler'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { StoreLocationsMap } from '@/features/checkout/purchase-order-checkout/shippingStep/StoreLocations'

// EVERY GATE HERE IS A COLUMN OF THE PARCEL (rulings 69/70, migration 128).
// The box, the service, where the parcel leaves from and the courier slot are
// `fulfillment.parcel`'s columns, so every write on this step is a PATCH of the
// draft fulfillment and the checkout row is not touched at all.
//
// `handoff` is resolved by the caller (gates.ts `resolveHandoff`) from the
// draft's own method type; `requires_schedule` is the server's answer to "does
// this handoff need a date and a time", read off that handoff.
export default function ShippingStep({
  row,
  fulfillment,
  rates,
  handoffs,
  handoff,
  isLoading,
}: {
  row?: CheckoutView
  fulfillment?: FulfillmentView
  rates: CheckoutRate[]
  handoffs: CarrierHandoff[]
  handoff: CarrierHandoff | null
  isLoading: boolean
}) {
  const { openDrawer } = useDrawerStore()
  const createFulfillment = useCreateFulfillment()
  const patchFulfillment = usePatchFulfillment()

  // The origin address is the parcel's, so writing it needs a draft. Until the
  // customer has picked a handoff there is none, and the default one the server
  // mints on the first POST carries their default address anyway.
  const setOrigin = (address_id: string) => {
    if (fulfillment) {
      patchFulfillment.mutate({
        fulfillment_id: fulfillment.fulfillment.id,
        shipment: { shipper_address_id: address_id },
      })
    } else if (row) {
      createFulfillment.mutate({ checkout_id: row.id })
    }
  }

  const { data: addresses = [] } = useAddress()
  const { data: links = [] } = useUserAddresses()
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const sortedAddresses = useMemo(
    () =>
      [...addresses].sort(
        (a, b) =>
          Number(linkOf.get(b.id)?.default_shipping ?? false) -
          Number(linkOf.get(a.id)?.default_shipping ?? false)
      ),
    [addresses, linkOf]
  )

  const address = addresses.find((a) => a.id === fulfillment?.parcel?.shipper_address_id)
  const selectedRate = rates.find((r) => r.selected)

  // The carrier needs a service family and an address to answer "when could we
  // collect"; both come off the row and the joined rate, never a uuid literal.
  const pickupTimesInput =
    handoff?.requires_schedule && address?.is_valid && selectedRate?.carrier_code
      ? {
          address_id: address.id,
          code: selectedRate.carrier_code,
          readyDate: new Date().toISOString().split('T')[0],
        }
      : null
  // null means "do not ask", which is what the query's `enabled` reads from it.
  const { data: times = [] } = useCarrierPickupTimes(pickupTimesInput)

  return (
    <div className="space-y-6 w-full">
      <AddressDrawer
        onSuccess={(saved) => {
          if (saved.address.is_valid) setOrigin(saved.address.id)
        }}
      />

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center">Create an address to continue checkout.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => openDrawer('address')}
          >
            Add Address
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <AddressSelect
              addresses={sortedAddresses}
              userAddresses={links}
              value={fulfillment?.parcel?.shipper_address_id ?? null}
              onChange={(addr) => {
                if (addr.is_valid) setOrigin(addr.id)
              }}
              onAddNew={() => openDrawer('address')}
            />

            {address && !address.is_valid && (
              <p className="text-destructive">
                Please provide a valid address to continue checkout.
              </p>
            )}
          </div>
        </div>
      )}

      <Divider />

      {address?.is_valid && (
        <>
          <PackageSelector fulfillment={fulfillment} />
          <Divider />
        </>
      )}

      {/* Handoff FIRST (only needs address + package) */}
      {address?.is_valid && fulfillment?.parcel?.package_id && (
        <>
          <PickupSelector
            handoffs={handoffs}
            selected={handoff?.code ?? null}
            checkout_id={row?.id}
          />
          <Divider />
        </>
      )}

      {/* Service AFTER the handoff: the rates are the parcel's, and the parcel
          is only described once a box is chosen. */}
      {address?.is_valid && fulfillment?.parcel?.package_id && (
        <>
          <ServiceSelector rates={rates} isLoading={isLoading} fulfillment={fulfillment} />
          <Divider />
        </>
      )}

      {handoff && selectedRate && (
        <div>
          {handoff.requires_schedule ? (
            times.length > 0 ? (
              <PickupScheduler times={times} fulfillment={fulfillment} />
            ) : (
              <p className="py-4">No pickup times available.</p>
            )
          ) : (
            <StoreLocationsMap address={address} />
          )}
        </div>
      )}
    </div>
  )
}
