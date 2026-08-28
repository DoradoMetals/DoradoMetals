import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/utils/cn'

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   THE DRAWER-HEADER STATUS PILL (Active/Inactive, Converted, Public/Hidden).

   WHAT CHANGED AND WHY. All five call sites passed a different text size, and
   the component's own comment admitted it — "`className` carries per-site size
   tweaks (text-sm/text-base, h-fit, gap-1)". A component whose comment
   documents that its callers must set its typography is a component missing a
   size variant. It has one now, and the five overrides delete.

   THE `glass` PROP IS GONE. It selected `success-on-glass` /
   `destructive-on-glass`, two of the glassmorphism classes ruling 16 deletes.
   Its only call site was features/products/ui/ProductDrawer.tsx. The tinted
   pill those classes produced IS the default look here, so nothing is lost —
   the prop was choosing between two spellings of the same thing.

   Pills, not rounded rectangles (ruling 19): `rounded-full`, and the type
   comes from the semantic scale (`text-micro`/`text-small`), never from a
   caller. */
/* ONE TONE VOCABULARY, AND IT IS THE BUTTON'S `intent` (ruling 25).

   There were two chips and two vocabularies: this one spoke
   positive/negative/neutral, and `ChipColumn` in shared/ui/table/Columns.tsx
   hand-rolled a second chip whose four call sites passed raw
   `bg-success/20 text-success border-success` strings. Two spellings of one
   idea is how they drift, and neither could say "warning" at all.

   `tone` now takes the same six values `Button` takes as `intent` -
   neutral | brand | success | danger | warning | info - so a green chip and a
   green button are green for the same declared reason. `positive`/`negative`
   survive as ALIASES because call sites pass them today (and the `positive`
   boolean prop below is five more); they map onto success/danger and cost
   nothing to keep. */
const statusChipVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full border font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        /* Neutral carries NO tint - ruling 19: hue is for status only. */
        neutral: 'bg-accent text-muted-foreground border-border',
        brand: 'bg-brand/15 text-brand border-brand/40',
        success: 'bg-success/15 text-success border-success/40',
        danger: 'bg-destructive/15 text-destructive border-destructive/40',
        warning: 'bg-warning/15 text-warning border-warning/40',
        info: 'bg-info/15 text-info border-info/40',
        // Aliases, kept so existing call sites keep compiling.
        positive: 'bg-success/15 text-success border-success/40',
        negative: 'bg-destructive/15 text-destructive border-destructive/40',
      },
      size: {
        sm: 'h-5 px-2 text-micro',
        default: 'h-6 px-2.5 text-micro',
        lg: 'h-7 px-3 text-small',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'default' },
  }
)

/** The shared tone vocabulary. Matches `Button`'s `intent` exactly. */
export type ChipTone = NonNullable<VariantProps<typeof statusChipVariants>['tone']>

type StatusChipProps = {
  /** Kept as the component's API: 5 call sites pass this boolean. */
  positive?: boolean
  children: React.ReactNode
  /** LAYOUT ONLY (ml-auto, self-start, w-full). Never appearance. */
  className?: string
} & Omit<VariantProps<typeof statusChipVariants>, 'tone'> & {
    tone?: VariantProps<typeof statusChipVariants>['tone']
  }

export default function StatusChip({
  positive,
  tone,
  size,
  className,
  children,
}: StatusChipProps) {
  const resolved = tone ?? (positive === undefined ? 'neutral' : positive ? 'success' : 'danger')
  return (
    <span className={cn(statusChipVariants({ tone: resolved, size }), className)}>{children}</span>
  )
}

export { statusChipVariants }
