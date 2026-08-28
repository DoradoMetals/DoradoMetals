import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/utils/cn'

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   A MISSING COMPONENT, found by the rule "the same inline appearance pattern
   three or more times is a component that does not exist yet". The three:

     shared/ui/SidebarLayout.tsx:192   the nav unread-count badge
     features/navigation/ui/Shell.tsx:94    cart count
     features/navigation/ui/Shell.tsx:138   cart count

   The original, hand-rolled, and Jacob's own example of the problem:

     <span className="flex ml-auto h-5 min-w-5 items-center justify-center
       rounded-full bg-primary px-1 text-[10px] font-medium text-white">

   Three things wrong with it, all fixed here: `text-white` on `bg-primary` is
   the D92 inversion (white on white); `text-[10px]` is an arbitrary type size
   with no place in the scale — it is the only arbitrary text size in the
   codebase, and the reason `--text-micro` exists; and the whole appearance was
   inline at three sites, so a change had to be made three times.

   TAG: this stays a `<span>` (ruling 22, case 2). A count badge is genuinely
   inline content sitting inside a row, not a paragraph. `<span><p>` would be
   invalid HTML — span accepts phrasing content, `<p>` is flow content. */
const countBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-1 font-medium tabular-nums',
  {
    variants: {
      tone: {
        /* Light ground, dark text — the primary pill at badge scale. */
        default: 'bg-primary text-primary-foreground',
        brand: 'bg-brand text-primary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        quiet: 'bg-accent text-foreground',
      },
      size: {
        sm: 'h-4 min-w-4 text-micro',
        default: 'h-5 min-w-5 text-micro',
      },
    },
    defaultVariants: { tone: 'default', size: 'default' },
  }
)

export type CountBadgeProps = {
  children: React.ReactNode
  /** LAYOUT ONLY (ml-auto, absolute placement). Never appearance. */
  className?: string
} & VariantProps<typeof countBadgeVariants>

export default function CountBadge({ children, className, tone, size }: CountBadgeProps) {
  return <span className={cn(countBadgeVariants({ tone, size }), className)}>{children}</span>
}

export { countBadgeVariants }
