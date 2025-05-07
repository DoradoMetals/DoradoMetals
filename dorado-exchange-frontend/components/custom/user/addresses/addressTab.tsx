'use client'

import { Button } from '@/components/ui/button'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus } from 'lucide-react'
import AddressModal from './addressDialog'
import { useGetSession } from '@/lib/queries/useAuth'
import { AddressCarousel } from './addressCarousel'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export default function AddressTab() {
  const { user } = useGetSession()
  const { data: addresses = [], isLoading } = useAddress()
  const [open, setOpen] = useState(false)

  const noAddresses = () => {
    if (!addresses || addresses.length === 0) {
      return true
    }
    return false
  }

  const defaultValues: Address = {
    id: crypto.randomUUID(),
    user_id: user?.id ?? '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    name: '',
    is_default: noAddresses(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone_number: '',
    country_code: 'US',
    is_valid: false,
    is_residential: false,
  }

  const [selectedAddress, setSelectedAddress] = useState<Address>(
    () => addresses?.[0] ?? defaultValues
  )

  return (
    <div className="flex flex-col">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
        </div>
      ) : (
        <>
          <div className="flex items-center mb-4">
            <h2 className="secondary-text">Addresses</h2>
            {!noAddresses() ? (
              <Button
                variant="ghost"
                className="ml-auto text-primary-gradient"
                onClick={() => {
                  setSelectedAddress(defaultValues)
                  setOpen(true)
                }}
              >
                + Create New
              </Button>
            ) : null}
          </div>
          <div>
            {noAddresses() ? (
              <div className="flex flex-col items-center gap-4">
                <div className="flex justify-center text-neutral-800">
                  Save a new address to your account.
                </div>
                <Button
                  className="w-1/2 liquid-gold raised-off-page shine-on-hover text-white"
                  effect="expandIcon"
                  variant="default"
                  size="sm"
                  iconPlacement="right"
                  icon={Plus}
                  iconSize={16}
                  onClick={() => {
                    setSelectedAddress(defaultValues)
                    setOpen(true)
                  }}
                >
                  <div className="flex items-center gap-2">Add Address</div>
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 justify-center">
              <AddressCarousel
                setOpen={setOpen}
                addresses={addresses}
                selectedAddress={selectedAddress}
                setSelectedAddress={setSelectedAddress}
              />
            </div>

            <AddressModal
              address={selectedAddress}
              open={open}
              setOpen={setOpen}
              title="Create New Address"
            />
          </div>
        </>
      )}
    </div>
  )
}
