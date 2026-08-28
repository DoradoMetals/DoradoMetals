'use client'

import type { Address, AddressFormValues, UserAddress } from '@/features/addresses/types'
import { Button } from '@/shared/ui/base/button'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ShippingPickupTimesInput, ShippingRate } from '@/features/shipping/types'
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

interface ShippingStepProps {
  addresses: Address[]
  emptyAddress: AddressFormValues
  rates: ShippingRate[]
  isLoading: boolean
}

export default function ShippingStep({
  addresses,
  emptyAddress,
  rates,
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

  let pickupTimesInput: ShippingPickupTimesInput | null = null
  if (address?.is_valid && service?.code) {
    pickupTimesInput = {
      carrier_id: '30179428-b311-4873-8d08-382901c581d8',
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
          <div className="text-center text-lg text-neutral-800">
            Create an address to continue checkout.
          </div>
          <Button
            type="button"
            effect="expandIcon"
            variant="outline"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => {
              setDraftAddress({ ...emptyAddress })
              openDrawer('address')
            }}
            className="border-primary text-primary hover:text-neutral-900 hover:bg-primary"
          >
            <div className="flex items-center gap-2">Add Address</div>
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
              <div className="text-sm text-destructive rounded-md">
                Please provide a valid address to continue checkout.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="separator-inset" />

      {address?.is_valid && (
        <>
          <InsuranceSelector />
          <div className="separator-inset" />

          <PackageSelector />
          <div className="separator-inset" />
        </>
      )}

      {/* Pickup FIRST (only needs address + pkg) */}
      {address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined && (
        <>
          <PickupSelector />
          <div className="separator-inset" />
        </>
      )}

      {/* Service AFTER pickup (needs address + pkg; service gets set here) */}
      {address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined && (
        <>
          <ServiceSelector rates={rates} isLoading={isLoading} />
          <div className="separator-inset" />
        </>
      )}

      {/* downstream UI that truly needs service + pickup */}
      {address?.is_valid &&
        pkg &&
        service &&
        pickup?.label &&
        (pickup.label === 'DROPOFF_AT_FEDEX_LOCATION' ||
          pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE') && (
          <div>
            {pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE' ? (
              times.length > 0 ? (
                <PickupScheduler times={times} />
              ) : (
                <div className="text-sm text-muted-foreground py-4">No pickup times available.</div>
              )
            ) : (
              <StoreLocationsMap />
            )}
          </div>
        )}
    </div>
  )
}
