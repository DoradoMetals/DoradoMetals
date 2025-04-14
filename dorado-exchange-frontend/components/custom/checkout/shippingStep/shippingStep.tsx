'use client'

import { Address } from '@/types/address'
import { AddressSelector } from './addressSelector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Dispatch } from 'react'

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
  const isEmpty = addresses.length === 0

  return (
    <div>
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
        <div className="flex flex-col gap-1">
          <div className="flex w-full justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-neutral-700 hover:text-primary px-0 py-0 h-auto min-h-0"
              onClick={() => {
                setOpen(true)
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="link"
              effect="hoverUnderline"
              className="text-neutral-700 hover:text-primary px-0 py-0 h-auto min-h-0"
              onClick={() => {
                setSelectedAddress(emptyAddress)
                setOpen(true)
              }}
            >
              <div className="flex items-center gap-1">
                Create New
              </div>
            </Button>
          </div>

          <AddressSelector
            addresses={addresses}
            selectedAddress={selectedAddress}
            setSelectedAddress={setSelectedAddress}
          />
        </div>
      )}

      
    </div>
  )
}
