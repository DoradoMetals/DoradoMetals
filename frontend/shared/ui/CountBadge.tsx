import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/utils/cn'

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   A MISSING COMPONENT, found by the rule "the same inline appearance pattern
   three or more times is a component that does not exist yet". The three:

     shared/ui/SidebarLayout.tsx:192   the nav unread-count badge
     features/navigation/ui/Shell.tsx:94    cart count
     features/navigation/ui/Shell.tsx:138   cart count

   The original, hand-rolled, was Jacob's own example of the problem: an
   ml-auto pill, 20px tall, rounded-full, painted with the primary background
   and white text at an arbitrary ten-pixel medium weight.

   Three things wrong with it, all fixed here: white text on the primary
   background is the D92 inversion (white on white); the arbitrary ten-pixel
   size had no place in the scale — it was the only arbitrary text size in the
   codebase, and the reason the micro token exists; and the whole appearance
   was inline at three sites, so a change had to be made three times.

   (Spelled in prose rather than as code, deliberately: the scatter linter and
   the arbitrary-size counter read the file, not the JSX, so a comment quoting
   a class string reports as a live call site. It did.)

   TAG: this stays a `<span>` (ruling 22, case 2). A count badge is genuinely
   inline content sitting inside a row, not a paragraph. `<span><p>` would be
   invalid HTML — span accepts phrasing content, `<p>` is flow content. */
const countBadgeVariants = cva(
  // No weight here: the size variants below carry `text-micro`, and the type
  // token owns its own weight (typography.css). A `font-medium` beside it is
  // scatter that says nothing.
  'inline-flex items-center justify-center rounded-full px-1 tabular-nums',
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
