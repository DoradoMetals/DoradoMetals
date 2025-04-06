'use client'

import * as React from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown } from 'lucide-react'

type Option = {
  label: string
  value: string
}

type Props = {
  value: string
  onChange: (val: string) => void
  options: Option[]
  placeholder?: string
  className?: string
}

export function PopoverSelect({ value, onChange, options, placeholder, className }: Props) {
  const [open, setOpen] = React.useState(false)



  const selected = options.find((opt) => opt.value === value)

  console.log('selected: ', selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`justify-between w-full h-9 px-2 bg-card text-sm shadow-lg font-normal ${className}`}
        >
          {selected?.label || <span className="text-neutral-700">{placeholder}</span>}
          <ChevronDown size={16} className='text-neutral-500' />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="cursor-pointer p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandList className="max-h-40 overflow-y-auto">
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                value={opt.value}
                onSelect={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className="cursor-pointer px-2"
                >
                <Check
                  size={16}
                  className={`mr-2 ${opt.value === value ? 'opacity-100' : 'opacity-0'}`}
                />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
