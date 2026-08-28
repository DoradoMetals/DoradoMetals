'use client'

import type { ComponentProps, ComponentType, ReactNode, SVGProps } from 'react'
import { cn } from '@/shared/utils/cn'

/* ICON TILE — a square-ish icon-over-label control. Five of them in the mobile
   Sidebar (Account, Orders, Sign Out / Sign In, Bid/Ask Spots), byte-identical.

   WHY IT IS NOT A BUTTON VARIANT, which is what the sweep first mapped it to.
   `<Button variant="secondary" className="w-20 h-18 flex flex-col">` renders
   `rounded-full` — a PILL stretched over an 80x72 box, which is a lozenge, not
   a tile. Ruling 19 is explicit that pills are for buttons and chips and that
   containers sit at ~8px, and a tile is a container with a control's job. The
   Button size axis cannot express it either: sizes there own height, padding
   AND type, and none of them is a two-line stacked box.

   It borrows Button's secondary/neutral appearance deliberately — hairline
   border at rest, `--accent` fill on hover, escalating one step exactly the way
   ruling 25's hover rule says — so the two read as the same family without the
   tile pretending to be a Button. */
export type IconTileProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  label: ReactNode
  iconSize?: number
}

export function IconTile({
  icon: Icon,
  label,
  iconSize = 24,
  className,
  type = 'button',
  ...props
}: IconTileProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        'w-20 h-18 flex flex-col items-center justify-center gap-1',
        'cursor-pointer rounded-lg border border-border bg-transparent',
        'text-small text-foreground transition-colors',
        'hover:bg-accent hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
    >
      <Icon size={iconSize} />
      <span>{label}</span>
    </button>
  )
}

export default IconTile
