'use client'

// Menu — the Figma "Menu" panel (132:19) and "Menu Item" set (132:18): the
// action menu that SelectMenu, PopoverSelect and ProfileMenu each hand-roll.
// A Menu performs ACTIONS where a Field picks a VALUE, so the check-carries-
// selection rule does not apply here and no item renders a check. Popover
// surface, p-2, hairline border; highlight is the accent fill — the same
// quiet-hover language as the Field option and the tertiary Button.
import * as React from 'react'
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'

import { cn } from './cn'

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger
const MenuGroup = MenuPrimitive.Group

const MenuContent = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[14rem] rounded-[10px] border border-border bg-popover p-2 text-popover-foreground',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        'motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
))
MenuContent.displayName = 'MenuContent'

const MenuItem = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & {
    /** Destructive actions carry the hue on icon and label both. */
    intent?: 'neutral' | 'danger'
  }
>(({ className, intent = 'neutral', ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none',
      'data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
      intent === 'danger' && 'text-destructive [&_svg]:text-destructive',
      className,
    )}
    {...props}
  />
))
MenuItem.displayName = 'MenuItem'

// Micro caps at placeholder — the drawn group label.
const MenuLabel = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Label
    ref={ref}
    className={cn('px-2 pb-1 pt-1.5 text-xs uppercase tracking-wider text-placeholder', className)}
    {...props}
  />
))
MenuLabel.displayName = 'MenuLabel'

const MenuSeparator = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator
    ref={ref}
    className={cn('my-1.5 h-px bg-border', className)}
    {...props}
  />
))
MenuSeparator.displayName = 'MenuSeparator'

// Trailing shortcut at placeholder colour; decoration, so aria-hidden.
function MenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn('ml-auto text-xs tracking-widest text-placeholder', className)}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuGroup, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuShortcut }
