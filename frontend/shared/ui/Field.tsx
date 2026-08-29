import type { ReactNode } from 'react'
import { Label } from '@/shared/ui/base/label'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   FIELD — a label above a control. The other half of DetailRow.
   ----------------------------------------------------------------------------
   DetailRow is a label beside a VALUE (read). This is a label above a CONTROL
   (write), and it was hand-rolled 33 times across the four admin drawers,
   every one of them byte-identical:

       <div className="flex flex-col gap-1">
         <Label htmlFor="name" className="pl-1">Product Name</Label>
         <Input id="name" ... />
       </div>

   Five lines to say "this input is called Product Name". Three more shared
   components had each grown their OWN private copy of it — `DisplayToggle`,
   `DotSelect` and `PopoverSelect` all spelled `<small className="pl-1">` above
   their control — which is the shape ruling 21's 3+ rule is written against:
   not a big duplication, a small one repeated until changing the gap between
   a label and its input means finding thirty-six places.

   IT IS NOT `ValidatedField`, and the difference is behaviour rather than
   looks: that one is bound to react-hook-form (a `control`, a `name`, an error
   message, a validity icon) and always renders an `Input`. This renders
   WHATEVER YOU PUT IN IT and knows nothing. Content is children — the meta-rule
   under ruling 30 — so a Field holds an Input, a Textarea, a segmented control,
   a date picker or a dropdown without gaining an axis for any of them.

   `htmlFor` is OPTIONAL because seven of the 33 had no `id` to point at (a
   dropdown that renders no labellable element). Where a call site has one,
   passing it is what makes clicking the label focus the control.

   `className` is LAYOUT ONLY (ruling 20) — `w-full`, grid placement, a wider
   gap. The label's own type comes from `Label`, which takes it from
   typography.css, so nothing here carries a type utility.
   ============================================================================ */

export type FieldProps = {
  label: ReactNode
  /** The `id` of the control inside. Omit when there is nothing to point at. */
  htmlFor?: string
  children: ReactNode
  /** LAYOUT ONLY — width, grid placement, alignment. Never appearance. */
  className?: string
}

export function Field({ label, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={htmlFor} className="pl-1">
        {label}
      </Label>
      {children}
    </div>
  )
}

export default Field
