"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/shared/utils/cn"

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   WHY THE DEFAULT CHANGED: 37 of 39 Label call sites passed the SAME three
   classes — `text-xs text-neutral-700 font-medium` (font-medium on 33 of them).
   That is not 37 call sites customising a label; that is one default that was
   never written down, copied 37 times. The component said `text-sm` and every
   caller overrode it to `text-xs`, so the default was simply wrong. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-micro leading-none font-medium text-neutral-700 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
