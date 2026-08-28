import * as React from 'react'

import { cn } from '@/shared/utils/cn'

/* ONE TEXTAREA, ONE APPEARANCE - the same ruling as base/input.tsx (ruling 28)
   and deliberately the SAME LOOK, so a text field and a multi-line field on the
   same form cannot disagree. The variant axis here was `default | filled |
   ghost`, mirroring Input's; it is gone for the same reason.

   `text-base` is the iOS zoom threshold; see input.tsx. `shadow-xs` went with
   ruling 27 - surfaces separate by hairline, not by shadow. */
const TEXTAREA_CLASS =
  'placeholder:text-neutral-500 text-foreground flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50'

export type TextareaProps = React.ComponentProps<'textarea'>

function Textarea({ className, ...props }: TextareaProps) {
  return <textarea data-slot="textarea" className={cn(TEXTAREA_CLASS, className)} {...props} />
}

export { Textarea, TEXTAREA_CLASS }
