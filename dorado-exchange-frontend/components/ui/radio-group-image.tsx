'use client'

import React from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export interface RadioGroupImageOption {
  id: string
  logo: string
  is_active?: boolean
}

interface RadioGroupImageProps<T extends RadioGroupImageOption> {
  items: T[]
  value: string
  onValueChange: (id: string) => void
  className?: string
  disabled?: boolean
}

export function RadioGroupImage<T extends RadioGroupImageOption>({
  items,
  value,
  onValueChange,
  className,
  disabled,
}: RadioGroupImageProps<T>) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4 w-full', className)}
      disabled={disabled ?? false}
    >
      {items.map((item) => (
        <label
          key={item.id}
          htmlFor={item.id}
          className={cn(
            'raised-off-page relative peer flex flex-col items-center justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md',
            !item.is_active && 'opacity-30 pointer-events-none',
            disabled && 'opacity-30 pointer-events-none',
          )}
        >
          <div className="w-full h-[5rem]">
            <Image
              src={item.logo}
              fill
              alt={item.logo}
              className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg p-4"
            />
          </div>
          <RadioGroupItem id={item.id} value={item.id} className="sr-only" />
        </label>
      ))}
    </RadioGroup>
  )
}
