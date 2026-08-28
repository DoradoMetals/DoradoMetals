'use client'

import type { ComponentProps, ElementType, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { RadioGroupItem } from '@/shared/ui/base/radio-group'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   RADIO CARD / SEGMENTED CONTROL — the clearest missing component in the app.
   ----------------------------------------------------------------------------
   Eighteen call sites found across two partitions: MetalStep, PurityStep,
   WeightStep, achForm, the insurance / package / pickup / service selectors
   (twice), AddressSelect's rows, UsersDrawer's add-subtract control,
   BullionTab's metal filter and PremiumControl's four pills. Every one of them
   is the same three decisions - a `<label>` that is the click target, a
   visually hidden radio inside it, and an appearance that changes on checked.

   ⚠ THE PART THAT IS NOT DECORATION. `radio-group-buttons` carried `relative`,
   and the hidden input carried `after:absolute after:inset-0`. Together those
   are what make the WHOLE CARD clickable and what the absolute-positioned
   checkmark is positioned against. Deleting the class without a replacement is
   a FUNCTIONAL regression - a control that stops responding outside the 16px
   radio - not a visual one, and it would not show up in a screenshot. This
   component owns both, so a call site can never drop half of the pair.

   THE AXES ARE THE HOUSE ONES (ruling 25), so this control and a Button agree:
     variant  card | segment     SHAPE
     intent   neutral | brand | success | danger | warning | info    MEANING

   CHECKED TREATMENT follows Button's own precedent, including its exception:
   a hued intent tints (a wash, its own border, its own text - the same
   `bg-X/15` StatusChip uses); NEUTRAL fills with `--primary` instead, because
   neutral's "colour" is white and a 15% white wash is not a state anyone can
   see. That is the same reason Button's neutral-secondary hover fills with
   `--accent` rather than with `--primary`.

   `as` exists because four call sites animate the card with `motion.label` and
   the spring is theirs, not this component's. Pass `as={motion.label}` and the
   motion props straight through.
   ============================================================================ */

const radioCardVariants = cva(
  // `relative` is load-bearing - see the warning above.
  'relative cursor-pointer select-none transition-colors border',
  {
    variants: {
      variant: {
        /** A full-width panel row: icon, title, blurb. Stacks vertically. */
        card: 'flex w-full items-center rounded-lg border-border bg-card px-3 py-2 hover:border-border-strong',
        /** One cell of a horizontal segmented control. */
        segment:
          'flex items-center justify-center rounded-md border-border bg-transparent px-3 py-2 text-small font-medium text-foreground',
      },
      intent: {
        neutral: '',
        brand: '',
        success: '',
        danger: '',
        warning: '',
        info: '',
      },
    },
    compoundVariants: [
      /* NEUTRAL FILLS. A 15% white wash on a near-black ground is invisible as
         a selected state, so neutral escalates to the solid primary surface -
         the same exception Button makes, for the same reason. */
      {
        intent: 'neutral',
        className: [
          'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground',
          /* ⚠ D99 - A STATE TOKEN AND A REST TOKEN THAT BECOME THE SAME COLOUR.
             `text-primary-foreground` INHERITS, and every element that sets its
             own colour ignores it. `strong` is `--neutral-900` (#f3f4f7) and
             `small` is `--muted-foreground`, both from typography.css's base
             rules - so a card whose content is `<strong>Gold</strong>` renders
             near-white text on the near-white `--primary` fill the moment it is
             selected. That is invisible UI in the SELECTED state only: the rest
             state reads fine, so nothing about the file looks wrong, and no
             screenshot of an unselected control shows it.
             Only NEUTRAL needs this. The hued intents wash at 15% over a
             near-black ground, so their descendants stay legible unchanged. */
          'has-[[data-state=checked]]:[&_strong]:text-primary-foreground',
          'has-[[data-state=checked]]:[&_b]:text-primary-foreground',
          'has-[[data-state=checked]]:[&_p]:text-primary-foreground/75',
          'has-[[data-state=checked]]:[&_small]:text-primary-foreground/75',
        ].join(' '),
      },
      {
        intent: 'brand',
        className:
          'has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/15 has-[[data-state=checked]]:text-brand',
      },
      {
        intent: 'success',
        className:
          'has-[[data-state=checked]]:border-success has-[[data-state=checked]]:bg-success/15 has-[[data-state=checked]]:text-success',
      },
      {
        intent: 'danger',
        className:
          'has-[[data-state=checked]]:border-destructive has-[[data-state=checked]]:bg-destructive/15 has-[[data-state=checked]]:text-destructive',
      },
      {
        intent: 'warning',
        className:
          'has-[[data-state=checked]]:border-warning has-[[data-state=checked]]:bg-warning/15 has-[[data-state=checked]]:text-warning',
      },
      {
        intent: 'info',
        className:
          'has-[[data-state=checked]]:border-info has-[[data-state=checked]]:bg-info/15 has-[[data-state=checked]]:text-info',
      },
    ],
    defaultVariants: { variant: 'card', intent: 'neutral' },
  }
)

type RadioCardOwnProps = VariantProps<typeof radioCardVariants> & {
  /** The RadioGroup value this card selects. */
  value: string
  /** Ties the label to the input. Defaults to `value`, which is unique within
   *  a group by definition. */
  id?: string
  children: ReactNode
  /** LAYOUT ONLY - w-full, flex-1, gap, grid placement. Never appearance. */
  className?: string
}

/* POLYMORPHIC ON `as`, and it has to be. The doc above says to pass
   `as={motion.label}` with the spring props straight through, and five call
   sites do exactly that - but a props type fixed to `ComponentProps<'label'>`
   rejects `initial` / `animate` / `transition`, so the documented usage did not
   compile. Inferring the element from `as` is what makes the escape hatch real
   instead of aspirational, and a plain `<RadioCard>` still gets full `<label>`
   checking because `T` defaults to `'label'`. */
export type RadioCardProps<T extends ElementType = 'label'> = RadioCardOwnProps & {
  /** The rendered element. `motion.label` when the card animates. It carries
   *  the generic, which is what lets the motion props be inferred. */
  as?: T
} & Omit<ComponentProps<T>, keyof RadioCardOwnProps | 'as'>

export function RadioCard<T extends ElementType = 'label'>({
  value,
  id,
  children,
  className,
  variant,
  intent,
  as: Tag = 'label' as T,
  ...props
}: RadioCardProps<T>) {
  const inputId = id ?? value
  /* TS cannot prove that a generic prop bag lines up with a generic element's
     own props inside the component; the check that matters happens at the CALL
     SITE, where `T` is concrete. This is the standard polymorphic-component
     escape and it is one cast, not a loosened public type. */
  const Component = Tag as ElementType
  return (
    <Component
      {...(props as Record<string, unknown>)}
      htmlFor={inputId}
      className={cn(radioCardVariants({ variant, intent }), className)}
    >
      {children}
      {/* Visually hidden, but `after:inset-0` stretches its hit area over the
          whole card. Both halves live here so neither can be dropped. */}
      <RadioGroupItem
        value={value}
        id={inputId}
        className="sr-only after:absolute after:inset-0"
      />
    </Component>
  )
}

export { radioCardVariants }
export default RadioCard
