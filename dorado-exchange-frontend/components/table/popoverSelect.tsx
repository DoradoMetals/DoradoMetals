'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type PopoverSelectProps = {
  label?: string
  value: string | null
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  triggerClass?: string
  popoverClass?: string
}

export function PopoverSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  triggerClass,
  popoverClass,
}: PopoverSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="w-full flex flex-col">
      {label && <span className="text-xs text-neutral-700 font-medium pl-1">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full m-0 justify-between bg-card border-none hover:bg-card', triggerClass)}
          >
            {value || <span className="text-neutral-500">{placeholder}</span>}
            <ChevronDown size={16} className="text-neutral-600" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className={cn(
            'p-0 m-0 bg-card z-70 w-[var(--radix-popover-trigger-width)] min-w-0 max-w-none',
            popoverClass
          )}
        >
          <Command className="bg-neutral-100">
            <CommandInput placeholder={`Search ${label || 'options'}...`} />
            <CommandSeparator />
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandList className="max-h-60 overflow-y-auto bg-card">
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option}
                    onSelect={() => {
                      onChange(option)
                      setOpen(false)
                    }}
                    className="cursor-pointer group flex items-center justify-between w-full gap-2 transition-colors duration-150 bg-card hover:bg-neutral-300"
                  >
                    <span className="flex items-center w-full justify-between">
                      {option}
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          value === option ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </span>
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
