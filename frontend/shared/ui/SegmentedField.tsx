'use client'

import { useId, type ReactNode } from 'react'
import { Field } from '@dorado/components'
import { RadioGroup, RadioOption } from '@dorado/components'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   SEGMENTED FIELD — the segmented control, and there is now exactly one.
   ----------------------------------------------------------------------------
   P1 named a segmented control "the clearest 3+ case in the app" (FOLLOWUPS,
   under ruling 26's design notes). The honest finding is worse than that: the
   app had FOUR implementations of one control.

     1. `RadioGroup variant="segment"` — the real one, radix-backed, with the
        hit-area overlay, the `htmlFor` and the audited D99 checked treatment.
     2. `shared/ui/DisplayToggle.tsx` + its private `SegBtn` (94 lines).
     3. `shared/ui/DotSelect.tsx` + its private `DotBtn` (99 lines).
     4. The hand-rolled ones the earlier waves already converted.

   2 and 3 ARE THE SAME COMPONENT. DisplayToggle is two cells over a boolean;
   DotSelect is N cells over a number. That is a different COUNT and a different
   VALUE TYPE — content and a degree, never behaviour — so under the meta-rule
   recorded beneath ruling 30 they are one thing, and both files are DELETED
   rather than kept as variants of each other.

   WHAT THEY WERE DOING WRONG, beyond existing twice:

     * APPEARANCE PASSED AS PROPS, which ruling 20 forbids outright and wave 4
       deleted from `TrackingEvents` for the same reason. Between them they
       took EIGHT of them — `onClass`, `offClass`, `inactiveClass`,
       `buttonClass`, `checkedClass`, `defaultClass`, `groupClassName`,
       `seamFixClassName`. A caller could paint a cell any colour it liked, so
       "the segmented control" had no appearance at all.
     * `text-sm font-medium` inside a `cn()` call. `lint:typography-scatter`
       could not see it at the time — it read `className="…"` literals and not
       `cn()` arguments — so both files reported clean at zero. The lint was
       taught to read `cn()`/`clsx()`/ternaries in the same session, which is
       what turned that 0 into a real number.
     * `role="radio"` on a plain `<button>` with no keyboard handling
       (DisplayToggle) or a hand-rolled arrow-key handler on the group
       (DotSelect). Radix already does this, correctly, in `RadioGroup`.

   SO THIS FILE HAS NO APPEARANCE OF ITS OWN. It is `Field` + `RadioOption`
   with `variant="segment"`, and every pixel comes from those two. The only
   thing it adds is the binding: a segmented control's value is usually a
   boolean or a small number, and radix's is a string, so options are addressed
   BY INDEX and the caller never sees a string it did not ask for.

   TWO LAYOUT SLOTS, BOTH LAYOUT ONLY (ruling 20), because a field is two
   boxes: `className` is the field itself (its width, its cell in a form grid)
   and `rowClassName` is the row the segments sit in. The default row is one
   line of equal cells; the two call sites with ten segments say
   `rowClassName="grid grid-cols-5 gap-2"`. That is the parent deciding extent,
   which is ruling 20's one legitimate override.
   ============================================================================ */

/** An option may be a bare value (its own label) or a value with a label. */
export type SegmentedOption<V> = { value: V; label: ReactNode }
export type SegmentedOptions<V> = readonly (V | SegmentedOption<V>)[]

/** The boolean default. Two cells, Yes and No — what thirteen of the fifteen
 *  call sites wanted, and passing it explicitly at all of them would be
 *  ceremony rather than clarity. */
const YES_NO: SegmentedOptions<boolean> = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
]

const isPair = <V,>(o: V | SegmentedOption<V>): o is SegmentedOption<V> =>
  typeof o === 'object' && o !== null && 'value' in (o as object)

export type SegmentedFieldProps<V> = {
  /** Names the field, above the control, and labels it for assistive tech. */
  label: ReactNode
  value: V
  onChange: (next: V) => void
  /** Omit for a boolean Yes/No. */
  options?: SegmentedOptions<V>
  disabled?: boolean
  /** LAYOUT ONLY — the field's own box: width, grid placement in a form. */
  className?: string
  /** LAYOUT ONLY — the row the cells sit in. Default is one row of equal
   *  cells; a call site with ten of them says `grid grid-cols-5 gap-2`. */
  rowClassName?: string
}

export function SegmentedField<V>({
  label,
  value,
  onChange,
  options = YES_NO as unknown as SegmentedOptions<V>,
  disabled,
  className,
  rowClassName,
}: SegmentedFieldProps<V>) {
  const entries = options.map((o) =>
    isPair(o) ? o : ({ value: o, label: String(o) } as SegmentedOption<V>)
  )
  /* Addressed by INDEX. `Object.is` rather than `===` so a numeric option set
     containing 0 is still matched when the field is unset, and so `NaN` — which
     `display_order` can be when a column is null and a caller forgets the
     `?? 0` — does not silently select the first cell. */
  const selected = entries.findIndex((e) => Object.is(e.value, value))
  /* KEYS ARE PREFIXED PER FIELD, AND THAT IS NOT COSMETIC. Two segmented
     fields on one page keyed `0`/`1` would collide, so `useId` makes the
     group's values unique across the document. */
  const uid = useId()
  const keys = entries.map((_, i) => `${uid}-${i}`)

  return (
    <Field label={label} className={className}>
      <RadioGroup
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        value={selected === -1 ? undefined : keys[selected]}
        onValueChange={(key) => onChange(entries[keys.indexOf(key)].value)}
        className={cn('flex w-full gap-2', rowClassName)}
      >
        {entries.map((entry, i) => (
          <RadioOption key={keys[i]} value={keys[i]} variant="segment" className="flex-1">
            {entry.label}
          </RadioOption>
        ))}
      </RadioGroup>
    </Field>
  )
}

export default SegmentedField
