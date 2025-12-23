'use client'

import { Address, makeEmptyAddress } from '@/features/addresses/types'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDrawerStore } from '@/store/drawerStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ServiceSelector from './serviceSelector'
import { SalesOrderTotals } from '@/types/sales-orders'
import { useGetSession } from '@/lib/queries/useAuth'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'

interface ShippingSelectProps {
  addresses: Address[]
  isLoading: boolean
  orderPrices: SalesOrderTotals
}

export default function ShippingSelect({ addresses, orderPrices }: ShippingSelectProps) {
  const { user } = useGetSession()
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = useSalesOrderCheckoutStore((state) => state.data.address)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default))
  }, [addresses])

  return (
    <div className="flex flex-col w-full">
      <AddressDrawer
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
              openDrawer('address')
            }}
            className="border-primary text-primary hover:text-neutral-900 hover:bg-primary"
          >
            <div className="flex items-center gap-2">Add Address</div>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
         

          <div className="flex flex-col gap-1 mb-6">
            <div className="flex flex-col gap-1">
              <AddressSelect
                addresses={sortedAddresses}
                value={address?.id ?? ''}
                onChange={(addr: Address) => setData({ address: addr })}
                onAddNew={() => openDrawer('address')}
                title='SHIPPING TO:'
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

      <div className="flex flex-col gap-6">
        <div className="separator-inset" />
        <ServiceSelector orderPrices={orderPrices} />
      </div>
    </div>
  )
}
