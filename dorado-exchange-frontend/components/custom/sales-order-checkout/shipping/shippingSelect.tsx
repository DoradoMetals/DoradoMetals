'use client'

import { Address, emptyAddress } from '@/types/address'
import { AddressSelector } from './addressSelector'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import AddressDrawer from '../../user/addresses/addressDrawer'
import { useDrawerStore } from '@/store/drawerStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ServiceSelector from './serviceSelector'
import { SalesOrderTotals } from '@/types/sales-orders'
import { PlusIcon } from '@phosphor-icons/react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useGetSession } from '@/lib/queries/useAuth'

interface ShippingSelectProps {
  addresses: Address[]
  isLoading: boolean
  orderPrices: SalesOrderTotals
}

export default function ShippingSelect({ addresses, orderPrices }: ShippingSelectProps) {
  const { user } = useGetSession()
  const [draftAddress, setDraftAddress] = useState<Address>(emptyAddress)
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = useSalesOrderCheckoutStore((state) => state.data.address)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  return (
    <div className="flex flex-col w-full">
      <AddressDrawer
        address={draftAddress}
        onSuccess={(savedAddress: Address) => {
          setData({ address: savedAddress })
        }}
      />

      {isEmpty ? (
        <div className="flex flex-col items-center gap-4 mb-6">
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-neutral-600 uppercase tracking-widest">Shipping To:</div>
            <Button
              type="button"
              variant="outline"
              className="flex ml-auto h-auto min-h-0 font-normal border-none hover:bg-background p-0 text-primary"
              onClick={() => {
                setDraftAddress({ ...emptyAddress, user_id: user?.id ?? '' })
                openDrawer('address')
              }}
            >
              <div className="flex text-xs items-center gap-1">
                Add New Address
                <PlusIcon size={16} color={getPrimaryIconStroke()} />
              </div>
            </Button>
          </div>
          <div className="flex flex-col gap-1 mb-6">
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
            <div className="text-xs lg:text-sm text-primary">
              Your card's billing address must match shipping address.
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <div className="separator-inset" />
        <ServiceSelector orderPrices={orderPrices} />
      </div>
    </div>
  )
}
