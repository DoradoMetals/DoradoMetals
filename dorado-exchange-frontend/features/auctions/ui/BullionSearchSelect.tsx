'use client'

import { useMemo, useState } from 'react'
import fuzzysort from 'fuzzysort'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { AdminProduct } from '@/features/products/types'
import { CheckIcon } from '@phosphor-icons/react'

type Props = {
  label?: string
  value: string | null
  products: AdminProduct[]
  onChange: (id: string) => void
  placeholder?: string
  triggerClass?: string
  popoverClass?: string
  limit?: number
}

export function BullionSearchSelect({
  label = '',
  value,
  products,
  onChange,
  placeholder = 'Search bullion...',
  triggerClass,
  popoverClass,
  limit = 60,
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const selected = useMemo(() => products.find((p) => p.id === value) ?? null, [products, value])

  const filtered: AdminProduct[] = useMemo(() => {
    const input = q.trim()
    if (!input) return products

    return fuzzysort
      .go(
        input,
        products.map((p) => ({
          ...p,
          searchText: `${p.product_name} ${p.product_name} ${p.metal} ${p.mint} ${p.supplier} ${p.slug}`,
        })),
        {
          keys: ['searchText'],
          limit,
          threshold: -10000,
        }
      )
      .map((r) => r.obj as AdminProduct)
  }, [products, q, limit])

  return (
    <div className="w-full flex flex-col gap-1">
      {label && <span className="text-xs text-neutral-700 font-medium pl-1">{label}</span>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild className="">
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            className={cn(
              'p-0 m-0 px-3 w-full justify-between on-glass hover:on-glass',
              'text-neutral-900',
              open && '',
              triggerClass
            )}
          >
            {selected ? (
              <span className="truncate">{selected.product_name}</span>
            ) : (
              <span className="text-neutral-500">{placeholder}</span>
            )}
            <ChevronDown size={16} className="text-neutral-600" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          portalled={false}
          align="start"
          sideOffset={4}
          className={cn(
            'z-140 w-[var(--radix-popover-trigger-width)] min-w-0 max-w-none',
            'on-glass',
            '',
            popoverClass
          )}
        >
          <Command className="w-full glass-panel border-none">
            <CommandInput
              placeholder="Search products..."
              value={q}
              onValueChange={setQ}
              className=""
            />
            <CommandSeparator className="m-0" />

            <CommandList className="custom-scrollbar max-h-50 overflow-y-auto glass-panel border-none">
              <CommandGroup className="border-none">
                {filtered.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.product_name}
                    onSelect={() => {
                      onChange(p.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'group cursor-pointer flex items-center justify-between w-full gap-2 bg-transparent my-1',
                      'text-neutral-800',
                      'data-[selected=true]:bg-primary/10',
                      'data-[selected=true]:rounded-lg',
                      value === p.id &&
                        'bg-primary/10 text-primary border border-primary rounded-lg'
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{p.product_name}</span>
                      <span className="text-xs text-neutral-600 truncate">
                        {p.metal} · {p.mint || '—'}
                      </span>
                    </div>

                    <CheckIcon
                      size={16}
                      className={cn(
                        'transition-opacity transition-colors',
                        value === p.id ? 'opacity-100' : 'opacity-0',
                        value === p.id && 'text-primary'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
