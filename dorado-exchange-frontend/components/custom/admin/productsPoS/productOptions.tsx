'use client'

import { FormField, FormItem, FormControl, FormMessage, FormLabel } from '@/components/ui/form'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, ChevronDown } from 'lucide-react'
import { UseFormReturn } from 'react-hook-form'
import { ProductFormSchema } from '@/types/admin'
import { useRef, useState } from 'react'

type Option = {
  id: number,
  name: string
}

type ProductOptionSelectProps = {
  form: UseFormReturn<ProductFormSchema>
  name: keyof ProductFormSchema
  label: string
  options: Option[]
}

export default function ProductOptionSelect({
  form,
  name,
  label,
  options,
}: ProductOptionSelectProps) {
  const value = form.watch(name)
  const selected = options.find((option) => option.name === value)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="relative w-full">
          <FormLabel className="text-xs text-neutral-700 pl-1">{label}</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <FormControl>
                <div ref={anchorRef} className="w-full">
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between bg-card text-neutral-900 text-sm shadow-lg border-none font-normal rounded-md h-12 px-3 hover:bg-card"
                  >
                    {selected ? selected.name : `${label}`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </div>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={0}
              className="p-0 bg-background z-50"
              onOpenAutoFocus={(e) => e.preventDefault()}
              style={{
                width: anchorRef.current?.offsetWidth ?? '100%',
              }}
            >
              <Command>
                <CommandList className="max-h-32 overflow-y-auto">
                  {options.length === 0 ? (
                    <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
                  ) : (
                    options.map((option) => (
                      <CommandItem
                        key={option.id}
                        onSelect={() => {
                          form.setValue(name, option.name)
                          setOpen(false)
                        }}
                        className="cursor-pointer"
                      >
                        {option.name}
                        <Check
                          className={cn(
                            'ml-auto h-4 w-4',
                            option.name === field.value ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    ))
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
