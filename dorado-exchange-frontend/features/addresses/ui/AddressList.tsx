'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/shared/ui/base/button'
import { Skeleton } from '@/shared/ui/base/skeleton'
import { useAddress } from '@/features/addresses/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { DebouncedInputSearch } from '@/shared/ui/inputs/DebouncedInputSearch'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MapPinIcon } from '@phosphor-icons/react'
import { AddressDrawer } from '@/features/addresses/ui/AddressDrawer'
import { AddressCard } from '@/features/addresses/ui/AddressCard'

export default function AddressList() {
  const { data: addresses = [], isLoading } = useAddress()
  const openDrawer = useDrawerStore((s) => s.openDrawer)

  const [query, setQuery] = useState('')

  const hasAddresses = addresses.length > 0

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
                    inputClassname="bg-card"
                  />
                </div>

                <Button variant="secondary" className="h-9 px-2" onClick={handleAdd}>
                  <div className="flex items-center gap-1">
                    <Plus size={16} />
                    <span className="text-xs md:text-sm">Add New</span>
                  </div>
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {filtered.map((addr) => (
                  <div key={addr.id ?? `${addr.user_id}-${addr.line_1}-${addr.zip}-${addr.name}`}>
                    <AddressCard
                      address={addr}
                      icon="auto"
                      showDefaultBanner
                      showEdit
                      showRemove
                      showSetDefault
                      onEdit={(a)  => {
                        openDrawer('address', {address: a})
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
              buttonLabel="Add New Address"
              onClick={handleAdd}
              buttonVariant="outline"
              buttonClassName="border-primary text-primary bg-card hover:text-neutral-900 hover:bg-primary hover:text-white hover:border-none"
            />
          )}

          <AddressDrawer />
        </>
      )}
    </div>
  )
}
