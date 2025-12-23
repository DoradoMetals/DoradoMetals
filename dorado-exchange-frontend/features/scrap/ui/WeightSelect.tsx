'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { useState } from 'react'
import { WeightOption, weightOptions } from '@/types/scrap'

export default function WeightSelect({
  value,
  onChange,
}: {
  value: WeightOption
  onChange: (value: WeightOption) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-10 h-5 p-0 bg-card border-none raised-off-page text-xs mt-1"
        >
          {value.unit}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={4}
        className="p-0 bg-card w-12 z-50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList className="max-h-52 overflow-y-auto">
            {weightOptions.map((option) => (
              <CommandItem
                key={option.id}
                onSelect={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className="flex items-center justify-center cursor-pointer bg-card"
              >
                <span>{option.unit}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
