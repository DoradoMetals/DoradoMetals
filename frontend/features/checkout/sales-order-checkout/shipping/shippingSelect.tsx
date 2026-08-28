'use client'

import { Address, UserAddress } from '@/features/addresses/types'
import { Button } from '@/shared/ui/base/button'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUserAddresses } from '@/features/addresses/queries'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import ServiceSelector from './serviceSelector'
import type { SalesOrderQuoteWire } from '@dorado/contracts'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'

interface ShippingSelectProps {
  addresses: Address[]
  isLoading: boolean
  orderPrices?: SalesOrderQuoteWire
}

export default function ShippingSelect({ addresses, orderPrices }: ShippingSelectProps) {
  const { openDrawer } = useDrawerStore()

  const isEmpty = addresses.length === 0

  const address = useSalesOrderCheckoutStore((state) => state.data.address)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  const { data: links = [] } = useUserAddresses()
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort(
      (a, b) =>
        Number(linkOf.get(b.id)?.default_shipping ?? false) -
        Number(linkOf.get(a.id)?.default_shipping ?? false)
    )
  }, [addresses, linkOf])

  return (
    <div className="flex flex-col w-full">
      <AddressDrawer
        onSuccess={(savedAddress: Address, savedLink?: UserAddress) => {
          setData({ address: savedAddress, user_address: savedLink })
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
                userAddresses={links}
                value={address?.id ?? ''}
                onChange={(addr: Address) =>
                  setData({ address: addr, user_address: linkOf.get(addr.id) })
                }
                onAddNew={() => openDrawer('address')}
                title="SHIPPING TO:"
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
