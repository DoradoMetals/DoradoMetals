'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/shared/ui/base/button'
import { Skeleton } from '@/shared/ui/base/skeleton'
import { useAddress, useUserAddresses } from '@/features/addresses/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { DebouncedInputSearch } from '@/shared/ui/inputs/DebouncedInputSearch'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MapPinIcon } from '@phosphor-icons/react'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { AddressCard } from '@/features/addresses/ui/AddressCard'

export default function AddressList() {
  // Two lists, one book: the addresses and what the caller names each one,
  // joined here by address_id.
  const { data: addresses = [], isLoading } = useAddress()
  const { data: links = [] } = useUserAddresses()
  const openDrawer = useDrawerStore((s) => s.openDrawer)

  const [query, setQuery] = useState('')

  const hasAddresses = addresses.length > 0
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const arr = [...addresses]
    arr.sort((a, b) => {
      const la = linkOf.get(a.id)
      const lb = linkOf.get(b.id)
      return (
        Number(lb?.default_shipping ?? false) - Number(la?.default_shipping ?? false) ||
        (la?.label ?? '').localeCompare(lb?.label ?? '')
      )
    })
    if (!q) return arr
    return arr.filter((a) => {
      const text = [linkOf.get(a.id)?.label, a.phone_number, a.line_1, a.line_2, a.city, a.state, a.zip]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(q)
    })
  }, [addresses, linkOf, query])

  const handleAdd = () => {
    openDrawer('address')
  }

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
          {hasAddresses ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex-1">
                  <DebouncedInputSearch
                    value={query}
                    onChange={(v) => setQuery(String(v))}
                    placeholder="Search Addresses..."
                  />
                </div>

                <Button variant="secondary" size="sm" onClick={handleAdd}>
                  <Plus size={16} />
                  Add New
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {filtered.map((addr) => (
                  <div key={addr.id}>
                    <AddressCard
                      address={addr}
                      userAddress={linkOf.get(addr.id)}
                      icon="auto"
                      showDefaultBanner
                      showEdit
                      showRemove
                      showSetDefault
                      onEdit={(a, ua) => {
                        openDrawer('address', { address: a, userAddress: ua ?? null })
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={MapPinIcon}
              title="No Addresses Found!"
              description="Add an address so we can save it to your account."
            >
              <Button variant="secondary" onClick={handleAdd}>
                Add New Address
              </Button>
            </EmptyState>
          )}

          <AddressDrawer />
        </>
      )}
    </div>
  )
}
