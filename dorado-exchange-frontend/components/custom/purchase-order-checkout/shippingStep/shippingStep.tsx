'use client'

import { Address } from '@/features/addresses/types'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PackageSelector } from './packageSelector'
import { FedexPickupTimesInput, formatFedexPickupAddress, FedexRate } from '@/types/fedex'
import { useFedExPickupTimes } from '@/lib/queries/useFedex'
import { ServiceSelector } from './serviceSelector'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { PickupSelector } from './pickupSelector'
import PickupScheduler from './pickupScheduler'
import { FedexLocationsMap } from './FedexLocations'
import { InsuranceSelector } from './insuranceSelector'
import { useDrawerStore } from '@/store/drawerStore'
import { useGetSession } from '@/lib/queries/useAuth'
import  {AddressDrawer} from '@/features/addresses/ui/AddressDrawer'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'

interface ShippingStepProps {
  addresses: Address[]
  emptyAddress: Address
  rates: FedexRate[]
  isLoading: boolean
}

export default function ShippingStep({
  addresses,
  emptyAddress,
  rates,
  isLoading,
}: ShippingStepProps) {
  const { user } = useGetSession()
  const [draftAddress, setDraftAddress] = useState<Address>(emptyAddress)
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const pkg = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const service = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default))
  }, [addresses])

  let fedexPickupTimesInput: FedexPickupTimesInput | null = null
  if (address?.is_valid && service) {
    fedexPickupTimesInput = {
      customerAddress: formatFedexPickupAddress(address),
      code: service.code,
    }
  }

  const { data: times = [] } = useFedExPickupTimes(fedexPickupTimesInput)

  return (
    <div className="space-y-6 w-full">
      <AddressDrawer
        onSuccess={(savedAddress: Address) => {
          setData({ address: savedAddress })
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
              setDraftAddress({ ...emptyAddress, user_id: user?.id ?? '' })
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
              addresses={addresses}
              value={address?.id ?? null}
              onChange={(addr) => setData({ address: addr })}
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

      {address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined && (
        <>
          <ServiceSelector rates={rates} isLoading={isLoading} />
          <div className="separator-inset" />
        </>
      )}

      {address?.is_valid && pkg && service && (
        <>
          <PickupSelector />
          <div className="separator-inset" />
        </>
      )}

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
              <FedexLocationsMap />
            )}
          </div>
        )}
    </div>
  )
}
