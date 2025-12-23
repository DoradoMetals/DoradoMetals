'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/lib/utils'
import { Filter, Check } from 'lucide-react'
import { useRef, useState, useLayoutEffect } from 'react'
import { Column } from '@tanstack/react-table'

type Option = string

type TableFilterSelectProps<TData> = {
  column: Column<TData, unknown>
  options: string[]
  anchorRef: React.RefObject<HTMLElement | null> // ✅ allow null
}

export function TableFilterSelect<TData>({
  column,
  options,
  anchorRef,
}: TableFilterSelectProps<TData>) {
  const [open, setOpen] = useState(false)
  const selected = column.getFilterValue() as string | undefined
  const [width, setWidth] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (anchorRef.current) {
      setWidth(anchorRef.current.offsetWidth)
    }
  }, [anchorRef.current, open]) // update on open in case layout changes

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn('p-0 hover:bg-transparent', selected && 'text-primary hover:text-primary')}
        >
          <Filter size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={4}
        className="p-0 bg-card z-50 w-32"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList className="max-h-52 overflow-y-auto">
            <CommandItem
              onSelect={() => {
                column.setFilterValue(undefined)
                setOpen(false)
              }}
              className="cursor-pointer bg-card"
            >
              <span>All</span>
              {!selected && <Check className="ml-auto opacity-100" size={16} />}
            </CommandItem>
            {options.map((option) => (
              <CommandItem
                key={option}
                onSelect={() => {
                  column.setFilterValue(option)
                  setOpen(false)
                }}
                className="cursor-pointer bg-card"
              >
                {option}
                <Check
                  size={16}
                  className={cn(
                    'ml-auto text-neutral-700',
                    selected === option ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
