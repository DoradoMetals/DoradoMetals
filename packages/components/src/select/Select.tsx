'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from '@dorado/icons'
import { fieldOption, fieldPanel, fieldTrigger, FieldLabel } from '../field/Field'
import { cn } from '../cn'

export type SelectItemShape = { value: string; label: React.ReactNode; disabled?: boolean }

export type SelectProps = {
  label?: React.ReactNode
  placeholder?: string
  items: SelectItemShape[]
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  name?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}

export function Select({
  label,
  placeholder = 'Select an option',
  items,
  value,
  onValueChange,
  defaultValue,
  name,
  disabled,
  invalid,
  className,
}: SelectProps) {
  const id = React.useId()
  return (
    <div className={cn('flex w-full flex-col gap-0.5', className)}>
      {label != null && (
        <FieldLabel htmlFor={id} className={cn(invalid && 'text-destructive')}>
          {label}
        </FieldLabel>
      )}
      <SelectPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        defaultValue={defaultValue}
        name={name}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={invalid || undefined}
          className={cn(fieldTrigger(), 'justify-between [&>span]:truncate')}
        >
          <SelectPrimitive.Value
            placeholder={<span className="text-muted-foreground">{placeholder}</span>}
          />
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(fieldPanel(), 'w-[var(--radix-select-trigger-width)]')}
          >
            <SelectPrimitive.Viewport className="flex flex-col gap-2">
              {items.map((item) => (
                <SelectPrimitive.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className={fieldOption()}
                >
                  <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ml-auto">
                    <Check aria-hidden className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  )
}
