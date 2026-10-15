'use client'

import NextLink from 'next/link'
import { Input } from '@dorado/components'
import { Search } from '@dorado/icons'

import { protectedRoutes } from '@/shared/types/routes'

import { useOrderSearch } from '../_api'

export type OrderSearchProps = {
  value: string
  onValueChange: (value: string) => void
  q: string
  mobile: boolean
}

export function OrderSearch({ value, onValueChange, q, mobile }: OrderSearchProps) {
  const hits = (useOrderSearch(q).data ?? []).filter((hit) => hit.kind === 'order')
  return (
    <div className={mobile ? 'relative w-full' : 'relative w-100'}>
      <Input
        aria-label="Search orders"
        placeholder={mobile ? 'Search…' : 'Search orders, customers, lots…'}
        leading={<Search />}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {q.trim().length > 1 && hits.length > 0 && (
        <ul
          aria-label="Order matches"
          className="absolute inset-x-0 top-full z-20 mt-2xs flex flex-col rounded-lg border border-border bg-card p-2xs"
        >
          {hits.map((hit) => (
            <li key={hit.id}>
              <NextLink
                href={`${protectedRoutes.adminOrders.path}/${hit.id}`}
                className="flex flex-col rounded-md px-xs py-2xs text-small text-foreground hover:bg-muted"
              >
                {hit.reference}
                <span className="text-micro text-muted-foreground">{hit.title}</span>
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
