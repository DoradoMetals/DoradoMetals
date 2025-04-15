'use client'

import { Address } from '@/types/address'
import { AddressSelector } from './addressSelector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Dispatch } from 'react'
import { PackageSelector } from './packageSelector'
import { FedexRateInput, formatFedexRatesAddress } from '@/types/shipping'
import { useFormContext, useWatch } from 'react-hook-form'
import { PurchaseOrderCheckout } from '@/types/checkout'
import { useFedExRates } from '@/lib/queries/shipping/useFedex'
import { ServiceSelector } from './serviceSelector'

interface ShippingStepProps {
  addresses: Address[]
  emptyAddress: Address
  setOpen: Dispatch<React.SetStateAction<boolean>>
  selectedAddress: Address
  setSelectedAddress: Dispatch<React.SetStateAction<Address>>
}

export default function ShippingStep({
  addresses,
  emptyAddress,
  setOpen,
  selectedAddress,
  setSelectedAddress,
}: ShippingStepProps) {
  const form = useFormContext<PurchaseOrderCheckout>()

  const isEmpty = addresses.length === 0

  const selectedPackage = useWatch({ control: form.control, name: 'package' })
  const pickupType = useWatch({ control: form.control, name: 'pickup_type' })

  const watchedAddress = useWatch({ control: form.control, name: 'address' })

  const isValid =
    watchedAddress &&
    watchedAddress.city &&
    watchedAddress.zip &&
    selectedPackage?.dimensions &&
    selectedPackage?.weight?.value

  const fedexRatesInput: FedexRateInput | null = isValid
    ? {
        shippingType: 'Inbound',
        customerAddress: formatFedexRatesAddress(watchedAddress),
        pickupType: pickupType || 'DROPOFF_AT_FEDEX_LOCATION',
        packageDetails: {
          weight: selectedPackage.weight,
          dimensions: selectedPackage.dimensions,
        },
      }
    : null

  const { data: rates = [], isLoading } = useFedExRates(fedexRatesInput)

  return (
    <div className="space-y-10">
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
              setSelectedAddress(emptyAddress)
              setOpen(true)
            }}
            className="border-primary text-primary hover:text-neutral-900 hover:bg-primary"
          >
            <div className="flex items-center gap-2">Add Address</div>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Address Selection</h2>
          <div className="flex flex-col gap-1">
            <div className="flex w-full justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-neutral-700 hover:text-primary hover:bg-background px-0 py-0 h-auto min-h-0 font-normal"
                onClick={() => {
                  setOpen(true)
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-neutral-700 hover:text-primary hover:bg-background px-0 py-0 h-auto min-h-0 font-normal"
                onClick={() => {
                  setSelectedAddress(emptyAddress)
                  setOpen(true)
                }}
              >
                <div className="flex items-center gap-1">Create New</div>
              </Button>
            </div>

            <AddressSelector
              addresses={addresses}
              selectedAddress={selectedAddress}
              setSelectedAddress={setSelectedAddress}
            />
          </div>
        </div>
      )}
      <div>
        <PackageSelector />
      </div>
      <div>
        <ServiceSelector rates={rates} isLoading={isLoading} />
      </div>
    </div>
  )
}
