'use client'

import { Button, Divider } from '@dorado/components'
import { Plus } from '@dorado/icons'
import { useMemo } from 'react'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUserAddresses } from '@/features/addresses/queries'
import { usePatchCheckout } from '@/features/checkout/queries'
import ServiceSelector from './serviceSelector'
import type { Address, CheckoutView, SalesOrderQuote } from '@dorado/contracts'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'

export default function ShippingSelect({
  addresses,
  row,
  orderPrices,
}: {
  addresses: Address[]
  row?: CheckoutView
  orderPrices?: SalesOrderQuote
}) {
  const { openDrawer } = useDrawerStore()
  const patchCheckout = usePatchCheckout('sale')

  const { data: links = [] } = useUserAddresses()
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const sortedAddresses = useMemo(
    () =>
      [...addresses].sort(
        (a, b) =>
          Number(linkOf.get(b.id)?.default_shipping ?? false) -
          Number(linkOf.get(a.id)?.default_shipping ?? false)
      ),
    [addresses, linkOf]
  )

  const address = addresses.find((a) => a.id === row?.recipient_address_id)

  return (
    <div className="flex flex-col w-full">
      <AddressDrawer
        onSuccess={(saved) => {
          if (saved.address.is_valid) patchCheckout.mutate({ recipient_address_id: saved.address.id })
        }}
      />

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-4 mb-6">
          <p className="text-center">Create an address to continue checkout.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => openDrawer('address')}
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
                value={row?.recipient_address_id ?? ''}
                onChange={(addr: Address) =>
                  patchCheckout.mutate({ recipient_address_id: addr.id })
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
        <Divider />
        <ServiceSelector row={row} orderPrices={orderPrices} />
      </div>
    </div>
  )
}
