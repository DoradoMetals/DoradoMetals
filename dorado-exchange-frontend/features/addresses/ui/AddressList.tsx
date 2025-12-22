'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAddress } from '@/features/addresses/queries'
import { Address, emptyAddress } from '@/features/addresses/types'
import { useDrawerStore } from '@/store/drawerStore'
import { useGetSession } from '@/lib/queries/useAuth'
import { AddressCard } from './AddressCard'
import AddressDrawer from './AddressDrawer'
import { DebouncedInputSearch } from '@/components/ui/debounced-input-search'

export default function AddressList() {
  const { user } = useGetSession()
  const { data: addresses = [], isLoading } = useAddress()
  const { openDrawer } = useDrawerStore()

  const [selectedAddress, setSelectedAddress] = useState<Address>(emptyAddress)
  const [query, setQuery] = useState('')

  const hasAddresses = addresses && addresses.length > 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const arr = [...addresses]
    arr.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name))
    if (!q) return arr
    return arr.filter((a) => {
      const text = [a.name, a.phone_number, a.line_1, a.line_2, a.city, a.state, a.zip]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(q)
    })
  }, [addresses, query])

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
          {hasAddresses && (
            <div className="mb-4 flex items-center gap-2">
              <div className="flex-1">
                <DebouncedInputSearch
                  value={query}
                  onChange={(v) => setQuery(String(v))}
                  placeholder="Search Addresses..."
                  inputClassname="bg-card"
                />
              </div>

              <Button
                variant="secondary"
                className="h-9 px-2"
                onClick={() => {
                  setSelectedAddress({ ...emptyAddress, user_id: user?.id ?? '' })
                  openDrawer('address')
                }}
              >
                <div className="flex items-center gap-1">
                  <Plus size={16} />
                  <span className="text-xs md:text-sm">Add New</span>
                </div>
              </Button>
            </div>
          )}

          {hasAddresses && (
            <div className="flex flex-col gap-3">
              {filtered.map((addr) => (
                <AddressCard
                  key={addr.id}
                  address={addr}
                  icon="auto"
                  showDefaultBanner
                  showEdit
                  showRemove
                  showSetDefault
                  onEdit={(a) => {
                    setSelectedAddress(a)
                    openDrawer('address')
                  }}
                />
              ))}
            </div>
          )}
          <AddressDrawer address={selectedAddress} />
        </>
      )}
    </div>
  )
}
