"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/shared/utils/cn"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator-root"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // A hairline is `--border` (ruling 19). `bg-neutral-300` is #3e4047, a step
        // brighter than the border token and brighter than every other rule in
        // the app, so every Separator read as a deliberate edge.
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "min-h-full w-[1px]",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
