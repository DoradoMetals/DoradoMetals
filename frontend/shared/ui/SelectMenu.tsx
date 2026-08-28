'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandItem, CommandList } from '@/shared/ui/base/command'
import { cn } from '@/shared/utils/cn'

// The hand-rolled Popover + Command menu (the payout-method-picker style): a
// custom trigger opening a short list of options, each optionally carrying an
// icon, selection closing the menu. Distinct from PopoverSelect, which is a
// searchable string combobox (CommandInput + fuzzysort + check marks) - the
// two share no DOM beyond the Popover shell, so this is a separate component
// rather than a mode of that one.
export type SelectMenuItem = {
  label: string
  value: string
  icon?: React.ComponentType<{ size?: number; className?: string }>
}

type SelectMenuProps = {
  items: SelectMenuItem[]
  onSelect: (value: string) => void
  /** The trigger element, rendered via PopoverTrigger asChild. */
  trigger: React.ReactNode
  /** Controlled open state; omit both to self-manage. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  /** Replaces the default PopoverContent classes when provided. */
  contentClassName?: string
  /** Replaces the default CommandItem classes when provided. */
  itemClassName?: string
  /** Appended to the CommandList. */
  listClassName?: string
}

const DEFAULT_CONTENT = 'p-0 w-48 z-70'
const DEFAULT_ITEM = cn(
  'group h-9 px-3 flex items-center gap-2 transition-colors duration-150 cursor-pointer',
  'text-primary',
  'hover:bg-primary'
)

export default function SelectMenu({
  items,
  onSelect,
  trigger,
  open,
  onOpenChange,
  align = 'end',
  side = 'bottom',
  sideOffset,
  contentClassName,
  itemClassName,
  listClassName,
}: SelectMenuProps) {
  const [selfOpen, setSelfOpen] = useState(false)
  const isOpen = open ?? selfOpen
  const setOpen = onOpenChange ?? setSelfOpen

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={contentClassName ?? DEFAULT_CONTENT}
        align={align}
        side={side}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="bg-card">
          <CommandList className={cn(listClassName)}>
            {items.map(({ label, value, icon: Icon }) => (
              <CommandItem
                key={value}
                onSelect={() => {
                  onSelect(value)
                  setOpen(false)
                }}
                className={itemClassName ?? DEFAULT_ITEM}
              >
                {Icon && <Icon size={16} className="text-primary" />}
                <span className="transition-colors">{label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
