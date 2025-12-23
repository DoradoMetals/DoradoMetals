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
        "shrink-0 bg-neutral-300",
        orientation === "horizontal" ? "h-[1px] w-full" : "min-h-full w-[1px]",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
