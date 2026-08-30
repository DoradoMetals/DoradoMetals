'use client'

import type { ComponentProps, ElementType, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { CheckCircle } from 'lucide-react'
import {
  RadioGroup as RadioGroupRoot,
  RadioGroupItem,
} from '@/shared/ui/base/radio-group'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   RADIO GROUP — ONE component, not three (ruling 30).
   ----------------------------------------------------------------------------
   Jacob: "fuck radio card and radio group image. Need to be coalesced so we
   don't have so much code in the consumers."

   WHAT DIED HERE. `shared/ui/RadioCard.tsx` (177 lines) and
   `shared/ui/RadioGroupImage.tsx` (76) are DELETED — not kept as variants.
   RadioGroupImage was never a different control, it was this control with an
   `<Image>` in the option, which is CONTENT, and content is children. That is
   the meta-rule recorded under ruling 30: before adding a component or a
   variant, ask whether the difference is a DIFFERENT THING or the SAME THING
   WITH DIFFERENT CONTENT.

   THE MEASURE IS THE CALL SITES, NOT THIS FILE. A consumer hands the group its
   options and a way to render one; it never again spells a `<label>`, an
   sr-only input, an `htmlFor`, a checked-state class string or a checkmark.

   ┌─ the common form ────────────────────────────────────────────────────────┐
   │  <RadioGroup                                                             │
   │    value={selected} onValueChange={setSelected}                          │
   │    options={packageOptions} getValue={(p) => p.label}                    │
   │    variant="tile" className="flex justify-between">                      │
   │    {(pkg) => <><pkg.icon size={20} /><strong>{pkg.label}</strong></>}    │
   │  </RadioGroup>                                                           │
   └──────────────────────────────────────────────────────────────────────────┘

   AND ONE ESCAPE HATCH, `RadioOption`, for the four call sites whose options
   are not a plain sequence: ProductCard and BullionCard wrap each option in a
   FloatingButtonItem, AddressSelect animates each one in with a staggered
   delay, PremiumControl hand-places two icon cells. A render-prop cannot wrap
   the label it is rendered inside, so those compose the option directly. It is
   the SAME option renderer — `RadioGroup` is a `.map` over `RadioOption` — so
   there is exactly one implementation of the label/input/overlay/checked
   treatment, which is the whole point.

   ⚠ THE PART THAT IS NOT DECORATION, inherited from RadioCard and kept.
   `relative` on the option plus `after:absolute after:inset-0` on the hidden
   input are what make the WHOLE option clickable and what the checkmark
   positions against. Deleting either is a FUNCTIONAL regression — a control
   that only responds within the 16px radio — invisible in a screenshot and
   invisible to every test. Both live here so a call site can never drop half
   of the pair. Same for `htmlFor`, which four call sites never had.

   THE AXES ARE THE HOUSE ONES (ruling 25), so this control and a Button agree:
     variant  card | tile | segment      SHAPE
     intent   neutral | brand | success | danger | warning | info    MEANING

   CHECKED TREATMENT — NEUTRAL SELECTS BY BORDER, NOT BY FILL (Figma, 2026-08-30).
   A hued intent tints (`bg-X/15`, its own border, its own text — StatusChip's
   wash). Neutral does NOT tint and no longer FILLS either: it takes a 1.5px
   `--primary` border and leaves the surface alone.

   WHY THIS CHANGED. The old reasoning was sound as far as it went: neutral's
   colour is white, a 15% white wash on a near-black ground is not a state
   anybody can see, so neutral filled with `--primary` instead. The design
   system answers the same question with a third option neither wash nor fill —
   `border-border` (#2c2f35) to `border-primary` (#fafafa) is an enormous move
   on the one property ruling 19 already uses to separate things. Figma's Radio
   Tile says it outright: "Selection reads as a primary-coloured 1.5px border",
   and Radio Card keeps `bg-card` on Selected=True.

   AND THE FILL WAS EXPENSIVE. `bg-primary` inverts the surface under content
   the component does not own, so surviving it took eleven
   `has-[[data-state=checked]]:[&_strong]:…` rules forcing every heading,
   paragraph and `<small>` to a light-on-light-safe colour — D99, an
   invisible-UI bug that only appeared once an option was selected. Those rules
   existed ONLY to survive the fill. No fill, no problem to survive: they are
   gone, and a call site's own type colours now mean what they say in both
   states.

   The contrast guard is unaffected and was checked rather than assumed:
   `state-contrast.test.ts` passes a state that moves ANY of bg/border/text by
   at least 1.25:1, and this moves the border by far more than that.
   ============================================================================ */

const radioOptionVariants = cva(
  // `relative` is load-bearing — see the warning above.
  'relative cursor-pointer select-none border transition-colors',
  {
    variants: {
      variant: {
        /** A full-width panel row: icon, title, blurb, price. Stacks, because
         *  every call site but one has two lines in it; a call site that wants
         *  one line adds `flex-row items-center`, which is layout. */
        card: 'flex w-full flex-col items-start gap-1 rounded-lg border-border bg-card px-3 py-2 hover:border-border-strong',
        /** One cell of a row or grid of independent choices. Stacks its
         *  content and centres it — the package/pickup/insurance/logo shape. */
        tile: 'flex flex-col items-center justify-center gap-2 rounded-lg border-border bg-card px-3 py-3 text-center hover:border-border-strong',
        /** One cell of a segmented control: no fill at rest, tight box. Its
         *  `text-small` is the SEMANTIC token, so it is the component owning
         *  its type (ruling 20) and not scatter — the cells are small and a
         *  body-sized label overflows a 40px pill. */
        segment:
          'flex items-center justify-center gap-1 rounded-md border-border bg-transparent px-3 py-2 text-small hover:border-border-strong',
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
      /* NEUTRAL SELECTS BY BORDER — see the header. `border-[1.5px]` is the
         design system's selected width; the rest state is the base `border`
         (1px), so the box does not resize because the element is
         `box-border` by Tailwind's preflight. */
      {
        intent: 'neutral',
        className:
          'has-[[data-state=checked]]:border-[1.5px] has-[[data-state=checked]]:border-primary',
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

type RadioOptionOwnProps = VariantProps<typeof radioOptionVariants> & {
  /** The group value this option selects. */
  value: string
  /** Ties the label to the input. Defaults to `value`, unique within a group
   *  by definition. Pass one only when two groups share a value on one page. */
  id?: string
  children: ReactNode
  /** LAYOUT ONLY — w-full, flex-1, gap, grid placement. Never appearance. */
  className?: string
  disabled?: boolean
}

/* POLYMORPHIC ON `as`, and it has to be: AddressSelect animates each option in
   with `motion.label` and a staggered delay, and a props type fixed to
   `ComponentProps<'label'>` rejects `initial`/`animate`/`transition`. Inferring
   the element from `as` is what makes that escape hatch real rather than
   aspirational; a plain `<RadioOption>` still gets full `<label>` checking
   because `T` defaults to `'label'`. */
export type RadioOptionProps<T extends ElementType = 'label'> = RadioOptionOwnProps & {
  as?: T
} & Omit<ComponentProps<T>, keyof RadioOptionOwnProps | 'as'>

export function RadioOption<T extends ElementType = 'label'>({
  value,
  id,
  children,
  className,
  variant,
  intent,
  disabled,
  as: Tag = 'label' as T,
  ...props
}: RadioOptionProps<T>) {
  const inputId = id ?? value
  /* TS cannot prove a generic prop bag lines up with a generic element's own
     props inside the component; the check that matters happens at the CALL
     SITE, where `T` is concrete. One cast, not a loosened public type. */
  const Component = Tag as ElementType
  return (
    <Component
      {...(props as Record<string, unknown>)}
      htmlFor={inputId}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        radioOptionVariants({ variant, intent }),
        disabled && 'pointer-events-none opacity-40',
        className
      )}
    >
      {/* FIRST so the checkmark below can be its `peer`. Visually hidden, but
          `after:inset-0` stretches its hit area over the whole option — see the
          header; this pair is functional, not decorative. */}
      <RadioGroupItem
        value={value}
        id={inputId}
        disabled={disabled}
        className="peer sr-only after:absolute after:inset-0"
      />
      {/* THE SELECTED AFFORDANCE, owned here rather than re-drawn at every call
          site (it was hand-rolled identically at four). No `text-*`: the tick
          inherits the option's own colour, which flips to
          `--primary-foreground` when a neutral option fills. `segment` cells
          are icon-sized and a tick would land on top of their content, so they
          rely on the fill alone. */}
      {variant !== 'segment' && (
        <CheckCircle
          size={12}
          aria-hidden
          className="pointer-events-none absolute right-1 top-1 opacity-0 transition-opacity duration-200 peer-data-[state=checked]:opacity-100"
        />
      )}
      {children}
    </Component>
  )
}

export type RadioGroupProps<T> = VariantProps<typeof radioOptionVariants> & {
  value: string | undefined
  onValueChange: (value: string) => void
  /** EITHER an array of options OR a record keyed by value — because half the
   *  call sites hold one and half hold the other, and making each of them spell
   *  `Object.entries(...)` plus a `getValue` plus a lookup back into the record
   *  is three lines of ceremony for a thing the group can just do. A record's
   *  KEY is the value; an array's comes from `getValue`, defaulting to
   *  `option.value`. */
  options: readonly T[] | Readonly<Record<string, T>>
  /** How to read an ARRAY option's value. Ignored for a record. */
  getValue?: (option: T) => string
  /** Per-option disable, e.g. a carrier whose organization is not enabled or a
   *  shipping service the rate call did not price. */
  isOptionDisabled?: (option: T, value: string) => boolean
  /** Renders ONE option's content. `checked` is handed over for the cases that
   *  genuinely need it in JS (a price only the selected row shows); the
   *  appearance of being checked is this component's job, never the caller's. */
  children: (option: T, checked: boolean, value: string) => ReactNode
  /** LAYOUT ONLY — the group's own flex/grid. */
  className?: string
  /** LAYOUT ONLY — applied to every option (`w-full`, `flex-1`). */
  optionClassName?: string
  disabled?: boolean
  name?: string
  'aria-label'?: string
}

const readValue = <T,>(option: T) => (option as { value: string }).value

export function RadioGroup<T>({
  value,
  onValueChange,
  options,
  getValue = readValue,
  isOptionDisabled,
  children,
  className,
  optionClassName,
  variant,
  intent,
  disabled,
  name,
  'aria-label': ariaLabel,
}: RadioGroupProps<T>) {
  const entries: [string, T][] = Array.isArray(options)
    ? (options as readonly T[]).map((option) => [getValue(option), option])
    : Object.entries(options as Record<string, T>)

  return (
    <RadioGroupRoot
      value={value ?? ''}
      onValueChange={onValueChange}
      disabled={disabled ?? false}
      name={name}
      aria-label={ariaLabel}
      className={className}
    >
      {entries.map(([optionValue, option]) => (
        <RadioOption
          key={optionValue}
          value={optionValue}
          variant={variant}
          intent={intent}
          disabled={isOptionDisabled?.(option, optionValue) ?? false}
          className={optionClassName}
        >
          {children(option, value === optionValue, optionValue)}
        </RadioOption>
      ))}
    </RadioGroupRoot>
  )
}

/* Re-exported so a composing call site has ONE door to come through: the four
   that use `RadioOption` directly still need a root to sit inside, and making
   them reach past this file into `base/radio-group` would put the radix
   primitive back in feature code. */
export { RadioGroupRoot, radioOptionVariants }
export default RadioGroup
