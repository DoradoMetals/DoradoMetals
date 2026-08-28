import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   THE CALL-SITE RULE — applies to EVERY shared component, not just this one.
   ----------------------------------------------------------------------------
   Jacob, standing: "In general the only tailwind that should REALLY live in
   consuming components is layout like flex/grid padding/margins etc etc."
   And: "all the Buttons shouldn't have all this styling on them. We should
   update the base component with variants and have the call sites use those
   variants instead of tons of fucking classNames."

     ALLOWED at a call site (the parent dictating this element's EXTENT):
       flex / grid placement, gap, margin, w-full, flex-1, size/position,
       order, alignment, responsive LAYOUT.

     NEVER at a call site (the element deciding its own APPEARANCE):
       bg-*, text-<colour>, text-<size>, font-*, border-*, rounded-*,
       shadow-*, opacity, transition, and ANY hover:/focus: appearance.

   PADDING IS A SIZE, NOT A LAYOUT OVERRIDE. `px-10` at a call site means
   "this button is wide", which is a size. If a call site needs padding no
   size offers, THE SIZE SET IS INCOMPLETE — add the size, do not permit the
   override. Only margins and container-driven extent (w-full, flex-1) stay.

   HOVER AND FOCUS BELONG TO THE VARIANT, ALWAYS. If a variant's hover is
   wrong, fix it here. A call site writing `hover:bg-primary` on a
   `bg-primary` button is cancelling a hover it did not want, which is a bug
   report about this file, not a style choice.

   This rule is deliberately grep-able so it can become a lint.

   ----------------------------------------------------------------------------
   THE API — two axes, per ruling 25 (Jacob).
   ----------------------------------------------------------------------------
     variant  primary | secondary | tertiary   (+ link, see below)
              EMPHASIS: filled -> outlined -> bare.
     intent   neutral | brand | success | danger | warning | info
              MEANING. `brand` is the Dorado gold, ruling 19's one permitted
              chrome hue; the rest are status semantics. Everything else stays
              monochrome.
     size     height + padding + type, INCLUDING the responsive step.

   The two axes are orthogonal and share no value names, so
   `variant="tertiary" intent="danger"` is a bare red Delete and
   `variant="primary" intent="danger"` is a filled one. That composition is
   what replaced the fused `destructiveQuiet` name.

   THE PROP IS CALLED `variant`, NOT `type`. `<button type="submit">` is a
   native attribute; a prop named `type` shadows it and the failure mode is a
   form that silently stops submitting. `ButtonProps` therefore Omits and
   re-declares `type` as the native union, so both survive.

   ----------------------------------------------------------------------------
   WHY THESE AXES — derived from the 193 call sites, not guessed.
   ----------------------------------------------------------------------------
   186 of 193 call sites passed a className; 158 of those overrode APPEARANCE.
   Clustered, they were four failure modes, and each names a fix:

     A) VARIANT CONTRADICTED (39) — the call site declares one variant and
        paints another, so the variant prop is decorative. The two dominant
        sub-clusters ARE the two things the old set could not express:
          * 24 sites: variant="ghost"/"outline" + `bg-card`/`hover:bg-card` —
            a QUIET button on a panel. That is `tertiary`.
          * 11 sites: variant="ghost"/"outline"/"secondary" + `bg-primary` —
            they wanted the filled button and named the wrong variant.
     B) CANCELLED HOVER (49) — `hover:bg-primary` on a `bg-primary` button,
        `hover:bg-transparent` on `link`, `hover:bg-card` on `ghost`. Nobody
        writes these unless the variant's hover is wrong. All three were.
     C) OVER-SPECIFIED PAINT (60) — re-asserting the default's own colours, or
        painting `link`/`ghost` a neutral text colour the variant should own.
     D) TYPE SIZE (6) + E) LAYOUT ONLY (32, legitimate) + 7 with no className.

   The old `ghost` (87 uses, the most common variant in the tree) was the worst
   of them: it was `text-primary-foreground` — near-BLACK on a near-black
   ground after the palette flip — with a hover that set `bg-transparent` on an
   already transparent button. `tertiary`/`neutral` is what those 87 wanted.

   Six `effect` variants (shine, shineHover, gooeyRight, gooeyLeft, underline,
   hoverUnderline) were gradient-and-animation dead code — zero call sites, and
   ruling 16 deletes that whole category. Only `expandIcon` (2 sites) and
   `ringHover` survive.
   ============================================================================ */

const buttonVariants = cva(
  // Pill by default (ruling 19: buttons and chips are pills; containers are 8px).
  // Type comes from the size variant, never from a call site.
  // `border` is always present so a variant can colour it without the box
  // resizing on hover when `tertiary` escalates into an outline.
  'cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      /* EMPHASIS. Named `variant` and not `type`: `<button type="submit">` is a
         native attribute and shadowing it is how a form silently stops
         submitting. Keeping the existing prop name also means every call site
         that already passes `variant` keeps its prop. */
      variant: {
        primary: '',
        secondary: '',
        tertiary: '',
        /* LINK is a fourth shape, not a fourth emphasis: no box, no padding, an
           underline. 21 call sites use it and the three-step axis has no way to
           express it, so it survives as its own value. It ignores `intent`
           except for its text colour.

           ITS BOX RESET IS A COMPOUND VARIANT, NOT PART OF THIS STRING, AND THE
           REASON IS EMIT ORDER — see the note above `compoundVariants` below.
           Do not move `h-auto`/`px-0`/`rounded-none`/`border-0` back up here. */
        link: 'bg-transparent text-foreground underline-offset-4 hover:underline',
      },
      intent: {
        neutral: '',
        brand: '',
        success: '',
        danger: '',
        warning: '',
        info: '',
      },
      effect: {
        expandIcon: 'group gap-0 relative',
        ringHover:
          'transition-all duration-300 hover:ring-2 hover:ring-ring/90 hover:ring-offset-2',
      },
      /* SIZE OWNS HEIGHT, PADDING **AND** TYPE — including the responsive step.
         `text-sm sm:text-base` was hand-rolled at call sites; it lives in `lg`
         now. `px-9`/`px-10`/`px-12` at call sites were all reaching for `xl`. */
      size: {
        xs: 'h-7 px-2.5 text-micro',
        sm: 'h-8 px-3 text-small',
        default: 'h-10 px-4 text-small',
        lg: 'h-11 px-6 text-small sm:text-body',
        xl: 'h-12 px-10 text-body sm:text-h6',
        icon: 'h-10 w-10 p-0',
        iconSm: 'h-8 w-8 p-0',
        iconXs: 'h-7 w-7 p-0',
        /* An inline affordance sized to the TEXT beside it, not to a tap
           target: a help icon at the end of a sentence, a clear affordance
           inside a field. `iconXs` is 28px and reads as a control; the
           sales-tax help icon had to write `className="size-4"` to get here,
           which is the size set being incomplete rather than a caller being
           fussy (ruling 20). Deliberately below the 24px minimum tap target -
           only use it where a larger target sits behind it or the action is
           non-essential. */
        iconInline: 'h-4 w-4 p-0',
      },
    },

    /* ------------------------------------------------------------------
       THE 18 COMBINATIONS, GENERATED FROM ONE RULE — NOT HAND-TUNED.

       HOVER ESCALATES ONE STEP OF EMPHASIS:
         tertiary  (bare text)      --hover-->  gains the outline
         secondary (outline)        --hover-->  fills
         primary   (filled)         --hover-->  nothing above it; the fill dims

       Because escalation is defined in terms of the INTENT's own colour, each
       intent needs only three rows and no per-combination special-casing:
       danger-tertiary hovers into a danger outline, danger-secondary hovers
       into a danger fill, automatically.

       THE ONE EXCEPTION, and it is deliberate rather than silent: NEUTRAL
       SECONDARY fills with `--accent` (a raised neutral surface), NOT with
       `--primary`. Every other intent fills with its own colour, but neutral's
       colour is WHITE, and a hairline-outlined button snapping to a white fill
       on hover is a jump from ~1.3:1 to 18:1 against the ground — it reads as
       a different button, not as a hover. Neutral escalates within the
       neutral ramp instead. Flagged for review rather than buried.
       ------------------------------------------------------------------ */
    /* ------------------------------------------------------------------
       EMIT ORDER IS LOAD-BEARING, and it caused a live bug.

       `cva` concatenates in a FIXED order: base, then each `variants` key in
       declaration order (variant, intent, effect, SIZE), then
       `compoundVariants`, then the caller's className. `cn()` is twMerge, so
       for two classes in the same group THE LAST ONE WINS.

       `size` therefore beats `variant`. When `link` carried its own
       `h-auto w-auto p-0 rounded-none`, the DEFAULT SIZE (`h-10 px-4`) was
       emitted after it and won: a bare `<Button variant="link">` rendered as a
       40px tall, horizontally padded, pill-shaped BOX in the middle of a
       sentence. The only thing hiding it was call sites re-spelling
       `p-0 h-auto` — which CONVERSION-TABLE.md was telling sweepers to delete
       as redundant. Deleting it produced no type error and no test failure,
       just a button-shaped box in a paragraph.

       Fixed by moving the box reset here, where it is emitted AFTER `size` for
       every size. Matching on `variant` alone (no `size` key) makes one row
       cover all eight sizes; cva applies a compound whenever every key it
       DOES name matches. `px-0 py-0` rather than `p-0`, deliberately: twMerge
       does not treat a later `p-0` as replacing an earlier `px-4`, so the
       axis-specific spellings are the ones that actually win.

       Pinned by `button.test.ts`, which asserts a bare `<Button
       variant="link">` needs no call-site classes.
       ------------------------------------------------------------------ */
    compoundVariants: [
      // LINK'S BOX RESET — must stay ahead of nothing and behind `size`.
      { variant: 'link',
        className: 'h-auto w-auto px-0 py-0 rounded-none border-0' },

      // ---- NEUTRAL ----
      { variant: 'primary', intent: 'neutral',
        className: 'bg-primary text-primary-foreground hover:bg-neutral-800' },
      { variant: 'secondary', intent: 'neutral',
        className: 'bg-transparent border-border text-foreground hover:bg-accent hover:border-border-strong' },
      { variant: 'tertiary', intent: 'neutral',
        className: 'bg-transparent text-muted-foreground hover:border-border hover:text-foreground' },

      /* ---- BRAND (the gold; ruling 19's one permitted chrome hue) ----
         NOTE — THERE IS NO "ON-BRAND" TREATMENT, and that is not an oversight
         this file should paper over. These three rows are for a button that IS
         the brand moment, sitting on an ordinary surface. A button sitting ON a
         gold ground needs the inverse (a dark or hairline button on gold), and
         `variant="primary" intent="brand"` is gold-on-gold — the same failure
         shape as D95, one token later.
         Ruling 19 says chrome carries no hue, so the likely correct answer is
         that nothing should be painting a `bg-brand` panel and no such variant
         is needed. That is a design call for Jacob, not one to guess at here,
         so the combination is left unexpressible rather than approximated. */
      { variant: 'primary', intent: 'brand',
        className: 'bg-brand text-primary-foreground hover:bg-brand/90' },
      { variant: 'secondary', intent: 'brand',
        className: 'bg-transparent border-brand text-brand hover:bg-brand hover:text-primary-foreground' },
      { variant: 'tertiary', intent: 'brand',
        className: 'bg-transparent text-brand hover:border-brand' },

      // ---- SUCCESS ----
      { variant: 'primary', intent: 'success',
        className: 'bg-success text-success-foreground hover:bg-success/90' },
      { variant: 'secondary', intent: 'success',
        className: 'bg-transparent border-success text-success hover:bg-success hover:text-success-foreground' },
      { variant: 'tertiary', intent: 'success',
        className: 'bg-transparent text-success hover:border-success' },

      // ---- DANGER ----
      { variant: 'primary', intent: 'danger',
        className: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
      { variant: 'secondary', intent: 'danger',
        className: 'bg-transparent border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground' },
      { variant: 'tertiary', intent: 'danger',
        className: 'bg-transparent text-destructive hover:border-destructive' },

      // ---- WARNING ----
      { variant: 'primary', intent: 'warning',
        className: 'bg-warning text-warning-foreground hover:bg-warning/90' },
      { variant: 'secondary', intent: 'warning',
        className: 'bg-transparent border-warning text-warning hover:bg-warning hover:text-warning-foreground' },
      { variant: 'tertiary', intent: 'warning',
        className: 'bg-transparent text-warning hover:border-warning' },

      // ---- INFO ----
      { variant: 'primary', intent: 'info',
        className: 'bg-info text-info-foreground hover:bg-info/90' },
      { variant: 'secondary', intent: 'info',
        className: 'bg-transparent border-info text-info hover:bg-info hover:text-info-foreground' },
      { variant: 'tertiary', intent: 'info',
        className: 'bg-transparent text-info hover:border-info' },

      // LINK takes its colour from the intent, nothing else.
      { variant: 'link', intent: 'brand', className: 'text-brand' },
      { variant: 'link', intent: 'danger', className: 'text-destructive' },
      { variant: 'link', intent: 'success', className: 'text-success' },
      { variant: 'link', intent: 'warning', className: 'text-warning' },
      { variant: 'link', intent: 'info', className: 'text-info' },
    ],

    /* DEFAULTS — MEASURED, NOT GUESSED. Of 193 call sites:
         87 say ghost (-> tertiary)      54 are primary (23 explicit `default`
         21 say link                         + 31 omitting the prop)
         26 say outline/secondary         2 say destructive

       `tertiary` would absorb the most props (87 vs 54). It is NOT the default
       anyway, and the reason is migration safety rather than taste: of the 31
       call sites that omit `variant` today, 11 paint nothing at all, so
       flipping the default to `tertiary` would silently turn 11 filled buttons
       into quiet ones in files this pass does not own. `master` auto-deploys
       and there is no staging environment (D92). `primary` changes the
       rendered result of ZERO unswept call sites; `tertiary` changes 11.
       Revisit once every partition has swept. */
    defaultVariants: {
      variant: 'primary',
      intent: 'neutral',
      size: 'default',
    },
  }
)

/* ----------------------------------------------------------------------------
   BACK-COMPAT SHIM — delete when every partition has swept.
   Maps the retired one-axis names onto the two-axis API so the ~140 call sites
   in features/** that this pass does not own keep rendering correctly instead
   of becoming type errors all at once. See CONVERSION-TABLE.md.
   -------------------------------------------------------------------------- */
const LEGACY_VARIANTS = {
  default: { variant: 'primary', intent: 'neutral' },
  outline: { variant: 'secondary', intent: 'neutral' },
  ghost: { variant: 'tertiary', intent: 'neutral' },
  destructive: { variant: 'primary', intent: 'danger' },
  destructiveQuiet: { variant: 'tertiary', intent: 'danger' },
  primaryQuiet: { variant: 'secondary', intent: 'neutral' },
  brand: { variant: 'primary', intent: 'brand' },
} as const

type LegacyVariant = keyof typeof LEGACY_VARIANTS

export type ButtonEmphasis = 'primary' | 'secondary' | 'tertiary' | 'link'
export type ButtonIntent = 'neutral' | 'brand' | 'success' | 'danger' | 'warning' | 'info'

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
    Omit<VariantProps<typeof buttonVariants>, 'variant' | 'intent'> {
  /** Emphasis. Legacy one-axis names still resolve; see LEGACY_VARIANTS. */
  variant?: ButtonEmphasis | LegacyVariant
  intent?: ButtonIntent
  asChild?: boolean
  /** The NATIVE button type. Never shadowed by the emphasis axis. */
  type?: 'button' | 'submit' | 'reset'
}

interface IconProps {
  icon: React.ElementType
  iconPlacement: 'left' | 'right'
  iconSize?: number // Uses Lucide's built-in size prop
}

interface IconRefProps {
  icon?: never
  iconPlacement?: undefined
  iconSize?: never
}

export type ButtonIconProps = IconProps | IconRefProps

const Button = React.forwardRef<HTMLButtonElement, ButtonProps & ButtonIconProps>(
  (
    {
      className,
      variant,
      intent,
      effect,
      size,
      icon: Icon,
      iconPlacement,
      iconSize,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'

    const legacy = variant && variant in LEGACY_VARIANTS
      ? LEGACY_VARIANTS[variant as LegacyVariant]
      : undefined
    const emphasis = (legacy?.variant ?? variant) as ButtonEmphasis | undefined
    const resolvedIntent = intent ?? legacy?.intent

    return (
      <Comp
        className={cn(
          buttonVariants({ variant: emphasis, intent: resolvedIntent, effect, size, className })
        )}
        ref={ref}
        {...props}
      >
        {Icon &&
          iconPlacement === 'left' &&
          (effect === 'expandIcon' ? (
            <div className="w-0 translate-x-[0%] pr-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-100 group-hover:pr-2 group-hover:opacity-100">
              <Icon size={iconSize} />
            </div>
          ) : (
            <Icon size={iconSize} />
          ))}
        <Slottable>{props.children}</Slottable>
        {Icon &&
          iconPlacement === 'right' &&
          (effect === 'expandIcon' ? (
            <div className="w-0 translate-x-full pl-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-0 group-hover:pl-2 group-hover:opacity-100">
              <Icon size={iconSize} />
            </div>
          ) : (
            <Icon size={iconSize} />
          ))}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
