'use client'

import type { Address, AddressFormValues, UserAddress } from '@/features/addresses/types'
import { Button } from '@dorado/components'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import type {
  CarrierHandoff,
  CarrierServiceOption,
  ShippingPickupTimesInput,
  ShippingRate,
} from '@/features/shipping/types'
import { useShippingPickupTimes } from '@/features/shipping/queries'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUserAddresses } from '@/features/addresses/queries'

import { AddressSelect } from '@/features/addresses/ui/AddressSelect'

import { InsuranceSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/insuranceSelector'
import { PackageSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/packageSelector'
import { ServiceSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/serviceSelector'
import { PickupSelector } from '@/features/checkout/purchase-order-checkout/shippingStep/pickupSelector'
import PickupScheduler from '@/features/checkout/purchase-order-checkout/shippingStep/pickupScheduler'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { StoreLocationsMap } from '@/features/checkout/purchase-order-checkout/shippingStep/StoreLocations'
import { Separator } from '@/shared/ui/base/separator'

interface ShippingStepProps {
  addresses: Address[]
  emptyAddress: AddressFormValues
  rates: ShippingRate[]
  // The carrier's own catalogue, read once by the stepper and injected
  // (ruling 14: the parent holds the read, the children take props). Neither
  // list is spelled anywhere in this tree any more.
  handoffs: CarrierHandoff[]
  services: CarrierServiceOption[]
  isLoading: boolean
}

export default function ShippingStep({
  addresses,
  emptyAddress,
  rates,
  handoffs,
  services,
  isLoading,
}: ShippingStepProps) {
  const [draftAddress, setDraftAddress] = useState<AddressFormValues>(emptyAddress)
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const pkg = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const service = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const { data: links = [] } = useUserAddresses()
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort(
      (a, b) =>
        Number(linkOf.get(b.id)?.default_shipping ?? false) -
        Number(linkOf.get(a.id)?.default_shipping ?? false)
    )
  }, [addresses, linkOf])

  // WHICH HANDOFF THE CUSTOMER PICKED, resolved against the reference list
  // rather than compared to a string. This is the change: the three branches
  // below used to read `pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE'`, so the
  // browser decided what to render next from a carrier's enum value. It reads
  // the option's own flags now, and a carrier adding a third handoff needs no
  // edit here.
  const handoff = useMemo(
    () => handoffs.find((h) => h.code === pickup?.label) ?? null,
    [handoffs, pickup?.label]
  )

  // `code` is the carrier's service family, received from the server with the
  // service and handed back. No carrier_id: the API resolves the carrier it
  // ships with (it was a uuid literal here).
  let pickupTimesInput: ShippingPickupTimesInput | null = null
  if (address?.is_valid && service?.code) {
    pickupTimesInput = {
      pickupAddress: address,
      code: service.code,
      readyDate: new Date().toISOString().split('T')[0],
    }
  }

  const { data: times = [] } = useShippingPickupTimes(pickupTimesInput as any)

  return (
    <div className="space-y-6 w-full">
      <AddressDrawer
        onSuccess={(savedAddress: Address, savedLink?: UserAddress) => {
          setData({ address: savedAddress, user_address: savedLink })
        }}
      />

      {isEmpty ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center">Create an address to continue checkout.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => {
              setDraftAddress({ ...emptyAddress })
              openDrawer('address')
            }}
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
              value={address?.id ?? null}
              onChange={(addr) => setData({ address: addr, user_address: linkOf.get(addr.id) })}
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

      <Separator />

      {address?.is_valid && (
        <>
          <InsuranceSelector />
          <Separator />

          <PackageSelector />
          <Separator />
        </>
      )}

      {/* Pickup FIRST (only needs address + pkg) */}
      {address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined && (
        <>
          <PickupSelector handoffs={handoffs} />
          <Separator />
        </>
      )}

      {/* Service AFTER pickup (needs address + pkg; service gets set here) */}
      {address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined && (
        <>
          <ServiceSelector services={services} rates={rates} isLoading={isLoading} />
          <Separator />
        </>
      )}

      {/* downstream UI that truly needs service + handoff */}
      {address?.is_valid && pkg && service && handoff && (
        <div>
          {handoff.requires_schedule ? (
            times.length > 0 ? (
              <PickupScheduler times={times} />
            ) : (
              <p className="py-4">No pickup times available.</p>
            )
          ) : handoff.has_dropoff_locations ? (
            <StoreLocationsMap />
          ) : null}
        </div>
      )}
    </div>
  )
}
