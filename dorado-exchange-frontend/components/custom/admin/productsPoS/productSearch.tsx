'use client'

import { useRef, useState } from 'react'
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandList, CommandItem } from '@/components/ui/command'
import { Check, X } from 'lucide-react'

import { AdminProduct } from '@/types/admin'

import { UseFormReturn } from 'react-hook-form'
import { ProductFormSchema } from '@/types/admin' // update path if needed
import { Button } from '@/components/ui/button'

type Props = {
  form: UseFormReturn<ProductFormSchema>
  products: AdminProduct[]
  setShowCreateButton: (value: boolean) => void
}
export default function ProductSearch({ form, products, setShowCreateButton }: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  const search = form.watch('product_name') ?? ''

  const filteredProducts = products.filter((product) =>
    product.product_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (productName: string) => {
    const matched = products.find((p) => p.product_name.toLowerCase() === productName.toLowerCase())

    if (matched) {
      form.reset(matched)
      setShowCreateButton(false)
    } else {
      setShowCreateButton(true)
      form.reset()
    }

    setOpen(false)
  }
  return (
    <FormField
      control={form.control}
      name="product_name"
      render={({ field }) => (
        <FormItem className="relative w-full">
          <FormControl>
            <div ref={anchorRef} className="w-full">
              <FloatingLabelInput
                label="Select Product"
                type="text"
                size="sm"
                className="input-floating-label-form"
                value={field.value}
                onChange={(e) => {
                  const value = e.target.value
                  field.onChange(value)
                  setOpen(true)

                  const match = products.find(
                    (p) => p.product_name.toLowerCase() === value.toLowerCase()
                  )

                  if (match) {
                    form.reset(match)
                    setShowCreateButton(false)
                  } else {
                    setShowCreateButton(true)
                  }
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 100)}
              />
            </div>
          </FormControl>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              form.setValue('product_name', '')
              setShowCreateButton(true)
              setOpen(false)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent"
            tabIndex={-1}
          >
            
              <X className="text-neutral-600" size={16} />
          </Button>

          <Popover open={open}>
            <PopoverTrigger asChild>
              <span className="sr-only">Open</span>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="p-0 bg-background z-50"
              style={{
                width: anchorRef.current?.offsetWidth ?? '100%',
              }}
            >
              <Command>
                <CommandList className="max-h-32 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <CommandItem
                      key={product.id}
                      onSelect={() => handleSelect(product.product_name)}
                      className="h-8 px-2"
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          product.product_name === field.value ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      {product.product_name}
                    </CommandItem>
                  ))}
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
