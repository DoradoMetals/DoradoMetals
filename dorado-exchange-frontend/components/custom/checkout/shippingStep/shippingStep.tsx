'use client'

import { Address } from '@/types/address'
import { AddressSelector } from './addressSelector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PackageSelector } from './packageSelector'
import { FedexRateInput, formatFedexRatesAddress } from '@/types/shipping'
import { useFedExRates } from '@/lib/queries/shipping/useFedex'
import { ServiceSelector } from './serviceSelector'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import AddressModal from '../../user/addresses/addressDialog'
import CheckoutAddressModal from './checkoutAddressDialog'

interface ShippingStepProps {
  addresses: Address[]
  emptyAddress: Address
}

export default function ShippingStep({ addresses, emptyAddress }: ShippingStepProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Create New')
  const [draftAddress, setDraftAddress] = useState<Address>(emptyAddress)

  const isEmpty = addresses.length === 0

  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const pkg = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const pickup_type = usePurchaseOrderCheckoutStore((state) => state.data.pickup_type)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  let fedexRatesInput: FedexRateInput | null = null

  if (address?.is_valid && pkg?.dimensions && pkg?.weight?.value !== undefined) {
    fedexRatesInput = {
      shippingType: 'Inbound',
      customerAddress: formatFedexRatesAddress(address),
      pickupType: pickup_type || 'DROPOFF_AT_FEDEX_LOCATION',
      packageDetails: {
        weight: pkg.weight,
        dimensions: pkg.dimensions,
      },
    }
  }

  const { data: rates = [], isLoading } = useFedExRates(fedexRatesInput)

  return (
    <div className="space-y-10">
      <CheckoutAddressModal
        address={draftAddress}
        open={open}
        setOpen={setOpen}
        title={title}
        onSuccess={(savedAddress: Address) => {
          // console.log('shipping step: ', savedAddress)
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
              setTitle('Create New')
              setDraftAddress(emptyAddress)
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
                  setTitle('Edit Address')
                  setDraftAddress(address ?? emptyAddress)
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
                  setTitle('Create New')
                  setDraftAddress(emptyAddress)
                  setOpen(true)
                }}
              >
                <div className="flex items-center gap-1">Create New</div>
              </Button>
            </div>

            <AddressSelector addresses={addresses} />
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
