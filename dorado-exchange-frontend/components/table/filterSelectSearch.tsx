'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Filter, Check } from 'lucide-react'
import { useState, useLayoutEffect } from 'react'
import { Column } from '@tanstack/react-table'

type TableSearchSelectProps<TData> = {
  column: Column<TData, unknown>
  options: string[]
  anchorRef: React.RefObject<HTMLElement | null>
  placeholder?: string
}

export function TableSearchSelect<TData>({
  column,
  options,
  anchorRef,
  placeholder = 'Search…',
}: TableSearchSelectProps<TData>) {
  const [open, setOpen] = useState(false)
  const selected = column.getFilterValue() as string | undefined
  const [width, setWidth] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (anchorRef.current) {
      setWidth(anchorRef.current.offsetWidth)
    }
  }, [anchorRef.current, open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn('p-0 hover:bg-transparent', selected && 'text-primary')}
        >
          <Filter size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={4}
        className="p-0 bg-card z-50 w-48"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{ width }}
      >
        <Command className='bg-card border-1 border-border'>
          <CommandInput placeholder={placeholder} className="border-b bg-card" />
          <CommandList className="max-h-52 overflow-y-auto bg-card">
            <CommandItem
              onSelect={() => {
                column.setFilterValue(undefined)
                setOpen(false)
              }}
              className="cursor-pointer bg-card hover:bg-card"
            >
              <span>All</span>
              {!selected && <Check className="ml-auto h-4 w-4 opacity-100" />}
            </CommandItem>
            {options.map((option, index) => (
              <CommandItem
                key={index}
                onSelect={() => {
                  column.setFilterValue(option)
                  setOpen(false)
                }}
                className="cursor-pointer bg-card hover:text-white"
              >
                {option}
                <Check
                  className={cn(
                    'ml-auto h-4 w-4',
                    selected === option ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
