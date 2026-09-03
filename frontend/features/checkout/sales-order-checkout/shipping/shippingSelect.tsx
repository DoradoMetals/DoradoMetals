'use client'

import { Address, UserAddress } from '@/features/addresses/types'
import { Button } from '@dorado/components'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUserAddresses } from '@/features/addresses/queries'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import ServiceSelector from './serviceSelector'
import type { quotes } from "@dorado/contracts";
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { Separator } from '@/shared/ui/base/separator'

interface ShippingSelectProps {
  addresses: Address[]
  isLoading: boolean
  orderPrices?: quotes.SalesOrderQuote
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
          <p className="text-center">Create an address to continue checkout.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => {
              openDrawer('address')
            }}
          >
            Add Address
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
                <p className="text-destructive">
                  Please provide a valid address to continue checkout.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <Separator />
        <ServiceSelector orderPrices={orderPrices} />
      </div>
    </div>
  )
}
