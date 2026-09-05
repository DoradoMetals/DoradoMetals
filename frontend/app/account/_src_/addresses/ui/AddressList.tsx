'use client'

// THE ADDRESS BOOK. It renders entries in the order the server sent them.
//
// The sort left with the join: this file used to fetch two lists, build a Map
// of one keyed by the other, sort by (default DESC, label ASC), and search
// across seven fields of both halves. The order is `rules.byDefaultThenRecipient`
// now; the search is the only thing left, because it is a property of the
// input box and not of the book.
import { useState, useMemo } from 'react'

import { Button, EmptyState, Input, Skeleton, useDebounce } from '@dorado/components'
import { MapPin, Plus, Search, X } from '@dorado/icons'
import { useAddressBook } from '@dorado/client'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { AddressDrawer } from '@/shared/ui/AddressDrawer'
import { AddressCard } from './AddressCard'

export default function AddressList() {
  const { data: entries = [], isLoading } = useAddressBook()
  const openDrawer = useDrawerStore((s) => s.openDrawer)

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      [
        e.user_address.recipient_name, e.user_address.label, e.address.phone_number,
        e.address.line_1, e.address.line_2, e.address.city, e.address.state, e.address.zip,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [entries, debouncedQuery])

  const handleAdd = () => openDrawer('address')

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-4">
        <Skeleton className="h-9 w-full mb-8" />
        <Skeleton className="h-9 w-full mb-8" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
        </div>
        <Skeleton className="h-9 w-full mb-8" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {entries.length > 0 ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Addresses..."
                leading={<Search size={16} />}
                trailing={
                  query ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      size="iconXs"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X size={14} />
                    </Button>
                  ) : undefined
                }
              />
            </div>

            <Button variant="secondary" size="sm" onClick={handleAdd}>
              <Plus size={16} />
              Add New
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {filtered.map((entry) => (
              <AddressCard
                key={entry.address.id}
                entry={entry}
                onEdit={(e) => openDrawer('address', { addressEntry: e })}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MapPin />}
          title="No Addresses Found!"
          description="Add an address so we can save it to your account."
          action={
            <Button variant="secondary" onClick={handleAdd}>
              Add New Address
            </Button>
          }
        />
      )}

      <AddressDrawer />
    </div>
  )
}
