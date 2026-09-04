'use client'

import { useState } from 'react'
import { Check } from '@dorado/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/base/command'
import { cn } from '@/shared/utils/cn'

// The hand-rolled Popover + Command menu (the payout-method-picker style): a
// custom trigger opening a short list of options, each optionally carrying an
// icon, selection closing the menu. Distinct from PopoverSelect, which is a
// FIELD - it renders its own labelled trigger showing the current value. This
// is an ACTION MENU: the caller supplies the trigger, and choosing a row does
// something rather than filling in a form.
//
// IT HAD ZERO IMPORTERS. Built in D88 and never adopted, while SIX hand-rolled
// copies of it stayed in the tree - five in `AdminReceived` and the status
// filter in `OrderStatusShared` - every one of them carrying the D95 defect
// this component's own header describes. A shared component nobody imports is
// worth exactly as much as no shared component at all.
//
// TWO PROPS WERE ADDED TO ABSORB THEM, and both are degrees rather than new
// components (the meta-rule under ruling 30): `searchPlaceholder` turns on the
// CommandInput two of the six needed for a long product list, and `value`
// marks the current row for the one of the six that is a filter rather than an
// action. Neither is a variant axis; a menu with a search box is the same menu.
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
  /** LAYOUT ONLY, and it MERGES with the default rather than replacing it -
   *  `?? DEFAULT` meant one added class silently deleted the whole surface. */
  contentClassName?: string
  /** LAYOUT ONLY. Merges, for the same reason. */
  itemClassName?: string
  /** Appended to the CommandList. */
  listClassName?: string
  /** Renders a search box above the list. Omit for a short menu. */
  searchPlaceholder?: string
  /** The currently chosen value, for a menu that is a FILTER rather than an
   *  action. Marks the row and shows a tick. Omit for an action menu. */
  value?: string
}

/* D95, THIRD INSTANCE — the row said `text-primary` AND `hover:bg-primary`.
   Both tokens are near-white now, so hovering a menu row filled it white
   underneath white text and the label vanished under the cursor. Same shape as
   SidebarLayout and ReviewInput: two classes, one element pair, no line a grep
   for `bg-primary.*text-white` could ever have matched.

   `--accent` is the token for a raised hover surface (every other hover in the
   app uses it), and the row's text is `--foreground`. Menu rows are chrome and
   ruling 19 says chrome carries no hue - `text-primary` was never saying
   anything here anyway. */
const DEFAULT_CONTENT = 'p-0 w-48 z-70'
const DEFAULT_ITEM =
  'group h-9 px-3 flex items-center justify-between gap-2 transition-colors duration-150 cursor-pointer text-foreground hover:bg-accent'
/* THE CHOSEN ROW FILLS (D99: is selected VISIBLY DIFFERENT from unselected,
   not merely legible). `--accent` is already the hover fill, so re-using it
   here would make hover and chosen identical - the exact collapse wave 4 found
   in `AddressSelect`. Neutral fills with `--primary` instead, which is what
   every other selection control in the app does, and the `!` beats the base
   `data-[selected=true]:bg-card` cmdk puts on the row under the cursor.
   The icon must NOT keep `text-muted-foreground` here: #9499a4 on #fafafa is
   2.4:1, which is the D95 shape all over again. */
const CHOSEN_ITEM = 'bg-primary! hover:bg-primary! text-primary-foreground'

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
  searchPlaceholder,
  value,
}: SelectMenuProps) {
  const [selfOpen, setSelfOpen] = useState(false)
  const isOpen = open ?? selfOpen
  const setOpen = onOpenChange ?? setSelfOpen

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={cn(DEFAULT_CONTENT, contentClassName)}
        align={align}
        side={side}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command surface="card">
          {searchPlaceholder ? (
            <CommandInput placeholder={searchPlaceholder} className="h-8" />
          ) : null}
          <CommandList className={cn(listClassName)}>
            {items.map((item) => {
              const chosen = value !== undefined && value === item.value
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.value}
                  onSelect={() => {
                    onSelect(item.value)
                    setOpen(false)
                  }}
                  className={cn(DEFAULT_ITEM, chosen && CHOSEN_ITEM, itemClassName)}
                >
                  <span className="flex items-center gap-2">
                    {Icon && (
                      <Icon size={16} className={chosen ? undefined : 'text-muted-foreground'} />
                    )}
                    <span>{item.label}</span>
                  </span>
                  {chosen && <Check size={16} />}
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
