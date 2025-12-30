'use client'

import React from 'react'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'

export interface RadioGroupImageOption {
  id: string
  name?: string
  logo: string
  is_active?: boolean
}

interface RadioGroupImageProps<T extends RadioGroupImageOption> {
  items: T[]
  value: string
  onValueChange: (id: string) => void
  className?: string
  disabled?: boolean
  buttonClass?: string
  imageClass?: string
  imageContainerClass?: string
  showName?: boolean
}

export function RadioGroupImage<T extends RadioGroupImageOption>({
  items,
  value,
  onValueChange,
  className,
  disabled,
  buttonClass = "border-1 border-border bg-background has-[[data-state=checked]]:bg-highest",
  imageClass,
  imageContainerClass = 'h-[5rem]',
  showName = true,
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
            'relative flex flex-col items-center justify-center w-full gap-2 rounded-lg px-4 py-3 cursor-pointer transition-colors ',
            buttonClass,
            !item.is_active && 'opacity-30 pointer-events-none',
            disabled && 'opacity-30 pointer-events-none'
          )}
        >
          <div
            className={cn('relative flex items-center justify-center w-full', imageContainerClass)}
          >
            <Image
              src={item.logo}
              fill
              alt={`${item?.name ?? ''} logo`}
              className={cn('pointer-events-none object-contain p-1', imageClass)}
            />
          </div>

          {showName && (
            <div className="text-sm md:text-base text-neutral-700">{item.name ?? ''}</div>
          )}

          <RadioGroupItem id={item.id} value={item.id} className="sr-only" />
        </label>
      ))}
    </RadioGroup>
  )
}
