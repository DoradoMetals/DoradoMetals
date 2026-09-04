'use client'

import type { Address, CarrierHandoff, CheckoutRate, CheckoutView } from '@dorado/contracts'
import type { UserAddress } from '@/features/addresses/types'
import { Button, Divider, Plus } from '@dorado/components'
import { useMemo } from 'react'

import { useCarrierPickupTimes } from '@dorado/client'
import { usePatchCheckout } from '@/features/checkout/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useAddress, useUserAddresses } from '@/features/addresses/queries'

import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { PackageSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/packageSelector'
import { ServiceSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/serviceSelector'
import { PickupSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/pickupSelector'
import PickupScheduler from '@/features/checkout/purchase-order-checkout/shippingStep/pickupScheduler'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { StoreLocationsMap } from '@/features/checkout/purchase-order-checkout/shippingStep/StoreLocations'

// EVERY GATE HERE IS A COLUMN OF THE ROW. `row.package_id`, `row.handoff_code`
// and `row.requires_schedule` replaced the store fields this file used to
// branch on, and `requires_schedule` in particular is the server's answer to
// "does this handoff need a date and a time" - the browser never sees a
// carrier's enum.
export default function ShippingStep({
  row,
  rates,
  handoffs,
  isLoading,
}: {
  row?: CheckoutView
  rates: CheckoutRate[]
  handoffs: CarrierHandoff[]
  isLoading: boolean
}) {
  const { openDrawer } = useDrawerStore()
  const patchCheckout = usePatchCheckout('purchase')

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

  const address = addresses.find((a) => a.id === row?.shipper_address_id)
  const selectedRate = rates.find((r) => r.selected)

  // The carrier needs a service family and an address to answer "when could we
  // collect"; both come off the row and the joined rate, never a uuid literal.
  const pickupTimesInput =
    row?.requires_schedule && address?.is_valid && selectedRate?.carrier_code
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
          if (saved.address.is_valid) {
            patchCheckout.mutate({ shipper_address_id: saved.address.id })
          }
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
              value={row?.shipper_address_id ?? null}
              onChange={(addr) => {
                if (addr.is_valid) patchCheckout.mutate({ shipper_address_id: addr.id })
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
          <PackageSelector row={row} />
          <Divider />
        </>
      )}

      {/* Handoff FIRST (only needs address + package) */}
      {address?.is_valid && row?.package_id && (
        <>
          <PickupSelector handoffs={handoffs} row={row} />
          <Divider />
        </>
      )}

      {/* Service AFTER the handoff: the rates are the parcel's, and the parcel
          is only described once a box is chosen. */}
      {address?.is_valid && row?.package_id && (
        <>
          <ServiceSelector rates={rates} isLoading={isLoading} />
          <Divider />
        </>
      )}

      {row?.handoff_code && selectedRate && (
        <div>
          {row.requires_schedule ? (
            times.length > 0 ? (
              <PickupScheduler times={times} row={row} />
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
