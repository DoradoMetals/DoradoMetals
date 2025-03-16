'use client'

import { Address } from '@/types/address'
import { Button } from '@/components/ui/button'
import AddressDialog from './addressDialog'
import { useState } from 'react'
import { useDeleteAddress, useSetDefaultAddress } from '@/lib/queries/useAddresses'
import { useUserStore } from '@/store/useUserStore'
import { Badge } from '@/components/ui/badge' // New badge component

export default function AddressCard({ address }: { address: Address }) {
  const deleteAddressMutation = useDeleteAddress();
  const setDefaultAddressMutation = useSetDefaultAddress();
  const [open, setOpen] = useState(false)

  return (
    <div className="shadow-md p-5 bg-background border border-card rounded-lg">
      <div className="flex items-center mb-4">
        <h3 className="text-lg font-semibold">{address.name}</h3>
        {address.phone_number && <p className="text-xs text-muted ml-auto">{address.phone_number}</p>}
      </div>

      <div className="text-sm text-muted leading-relaxed">
        <p>
          {address.line_1} {address.line_2 && `, ${address.line_2}`}
        </p>
        <p>{`${address.city}, ${address.state}, ${address.zip}`}</p>
        <p>{address.country}</p>
      </div>

      <div className="flex items-center justify-between gap-4 mt-4 text-sm font-medium">
        {!address.is_default ? (
          <Button
            variant="link"
            effect="hoverUnderline"
            className="m-0 p-0 underline"
            onClick={() => setDefaultAddressMutation.mutate(address)}
          >
            Set Default
          </Button>
        ) : (
          // <Badge className="bg-background text-xs px-2 py-1">Default</Badge>
          null
        )}

        <div className="flex items-center gap-6 ml-auto">
          <Button
            variant="default"
            size="sm"
            className="text-primary bg-card hover:bg-card"
            onClick={() => setOpen(true)}
          >
            Edit
          </Button>
          <Button
            variant="default"
            size="sm"

            onClick={() => deleteAddressMutation.mutate(address)}
          >
            Remove
          </Button>
        </div>
      </div>

      <AddressDialog address={address} open={open} setOpen={setOpen} title="Edit" />
    </div>
  )
}
