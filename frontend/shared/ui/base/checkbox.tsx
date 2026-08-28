"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "@phosphor-icons/react"

import { cn } from "@/shared/utils/cn"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "cursor-pointer peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {/* THE CHECK INHERITS ITS COLOUR — it does not name one.

          It used to say `text-primary`, which after the palette flip is a
          near-WHITE tick on the near-white `data-[state=checked]:bg-primary`
          box above: an invisible checked state on "Remember me" and on the
          terms-acceptance checkbox that GATES SIGN-UP. It was masked only by
          `.checkbox-form`, an unlayered class that repaints the box `bg-card`
          and so happened to make a white tick legible again.

          `text-current` inherits, so both resolve correctly and independently:
          the bare checkbox takes the root's
          `data-[state=checked]:text-primary-foreground` (dark tick, white box),
          and a `.checkbox-form` checkbox takes that class's own
          `data-[state=checked]:text-primary` (white tick, card box). Naming
          either colour here would have broken the other, and would have forced
          the four `.checkbox-form` call sites - in another partition - to be
          deleted in lockstep with this line. */}
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon size={24} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
