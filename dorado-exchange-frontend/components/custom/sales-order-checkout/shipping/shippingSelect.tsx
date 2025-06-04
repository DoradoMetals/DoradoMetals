'use client'

import { Address } from '@/types/address'
import { AddressSelector } from './addressSelector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import AddressDrawer from '../../user/addresses/addressDrawer'
import { useDrawerStore } from '@/store/drawerStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ServiceSelector from './serviceSelector'

interface ShippingSelectProps {
  addresses: Address[]
  emptyAddress: Address
  isLoading: boolean
}

export default function ShippingSelect({
  addresses,
  emptyAddress,
  isLoading,
}: ShippingSelectProps) {
  const [draftAddress, setDraftAddress] = useState<Address>(emptyAddress)
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = useSalesOrderCheckoutStore((state) => state.data.address)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  return (
    <div className="space-y-6 w-full">
      <AddressDrawer
        address={draftAddress}
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
              setDraftAddress(emptyAddress)
              openDrawer('address')
            }}
            className="border-primary text-primary hover:text-neutral-900 hover:bg-primary"
          >
            <div className="flex items-center gap-2">Add Address</div>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="flex ml-auto h-auto min-h-0 font-normal text-neutral-700 border-none hover:bg-background p-0"
            onClick={() => {
              setDraftAddress(emptyAddress)
              openDrawer('address')
            }}
          >
            <div className="flex text-xs items-center gap-1">
              Add New Address
              <Plus size={16} className="" />
            </div>
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex flex-col gap-1">
              <AddressSelector
                addresses={addresses}
                setDraftAddress={setDraftAddress}
                emptyAddress={emptyAddress}
              />
              {address && !address.is_valid && (
                <div className="text-sm text-destructive rounded-md">
                  Please provide a valid address to continue checkout.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="separator-inset" />
      <ServiceSelector />
    </div>
  )
}
