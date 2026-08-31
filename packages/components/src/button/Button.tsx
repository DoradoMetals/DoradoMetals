'use client'

// Button - the drawing at Themes and Components 25:510, all 135 variants of it,
// expressed as three orthogonal axes exactly as its description demands:
//
//   variant  EMPHASIS   primary (filled) / secondary (outlined) / tertiary (bare)
//   intent   MEANING    neutral / success / danger / warning / info
//   size     GEOMETRY   the drawing's sm/default/lg plus the in-use sizes it
//                       says to add "if call sites need them" - they do
//                       (36 sm, 30 icon, 9 lg, 8 xl, 5 xs at last count)
//
// THE HOVER LANGUAGE IS "ESCALATE ONE STEP": tertiary fills with accent
// (the file's quiet-hover language - Jacob rejected the drawn outline),
// secondary fills, primary dims - and primary dims by RAMP STEP (neutral-800),
// not by opacity, because /90 over a dark ground muddies where a step stays
// clean. Neutral secondary is the drawn exception: it fills with --accent, not
// --primary. Hued secondaries fill with their hue and flip to its foreground.
//
// WHAT DIED HERE, deliberately:
//   - `rounded-full`: the drawing says rounded-[var(--radius)] - the pill is
//     the old brand.
//   - `intent="brand"`: "the gold is retired", stated on the drawing itself.
//   - `variant="link"`: "Link is a SEPARATE component, not a Button variant.
//     A link navigates, a button acts." See link.tsx.
//   - the six `effect` variants: zero call sites used any of them.
//
// THE CALL-SITE RULE travels with the component (from the file this replaces):
// layout (flex placement, gap, margin, w-full, size) belongs to call sites;
// appearance (colors, type, borders, radius, hover) belongs HERE. If a variant
// looks wrong, fix it here - a call site cancelling a hover is a bug report
// about this file.
import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const buttonVariants = cva(
  // rounded-lg IS var(--radius): the theme maps --radius-lg to it.
  // THE HOVER LAW IS OPACITY (Jacob, 2026-08-31): every variant hovers at
  // 85% of itself - one rule, all three emphases, no reflow, no borrowed
  // language. The underline (and the accent fill, and the outline before it)
  // are retired; underline belongs to Link alone.
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-medium ring-offset-background transition-[color,background-color,border-color,opacity] hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "",
        secondary: "bg-transparent",
        // Bare text - but the px-0 reset lives in a compound variant below,
        // NOT here: cva emits size after variant and twMerge lets the last
        // px-* win, so a reset spelled here loses to the default size's px-4.
        // That exact composition-order bug shipped once already (the old
        // variant="link" rendered as a 40px padded pill); the test pins it.
        tertiary: "bg-transparent",
      },
      intent: {
        neutral: "",
        success: "",
        danger: "",
        warning: "",
        info: "",
      },
      size: {
        xs: "h-7 px-2.5 text-micro",
        sm: "h-8 px-3 text-small",
        default: "h-10 px-4 text-small",
        // The responsive step is the code's own feature; the drawing is
        // static. LG is text-body from the drawing, stepped down on small
        // screens exactly as the file this replaces did.
        lg: "h-11 px-6 text-small sm:text-body",
        xl: "h-12 px-10 text-body sm:text-h6",
        icon: "h-10 w-10 p-0",
        iconSm: "h-8 w-8 p-0",
        iconXs: "h-7 w-7 p-0",
        iconInline: "h-4 w-4 p-0",
      },
    },
    compoundVariants: [
      // ---- primary: filled; hover dims one ramp step ----
      { variant: "primary", intent: "neutral",
        className: "bg-primary text-primary-foreground" },
      { variant: "primary", intent: "success",
        className: "bg-success text-success-foreground" },
      { variant: "primary", intent: "danger",
        className: "bg-destructive text-destructive-foreground" },
      { variant: "primary", intent: "warning",
        className: "bg-warning text-warning-foreground" },
      { variant: "primary", intent: "info",
        className: "bg-info text-info-foreground" },

      // ---- secondary: outlined; hover fills. Neutral fills with ACCENT (the
      //      drawn exception); a hue fills with itself and flips its text ----
      { variant: "secondary", intent: "neutral",
        className: "border-border text-foreground" },
      { variant: "secondary", intent: "success",
        className: "border-success text-success" },
      { variant: "secondary", intent: "danger",
        className: "border-destructive text-destructive" },
      { variant: "secondary", intent: "warning",
        className: "border-warning text-warning" },
      { variant: "secondary", intent: "info",
        className: "border-info text-info" },

      // ---- tertiary: bare. px-2/-mx-2 keeps bare-text alignment while
      //      focus-visible still gets geometry. Emitted after the size axis
      //      to survive the merge.
      { variant: "tertiary", className: "px-2 -mx-2" },

      { variant: "tertiary", intent: "neutral",
        className: "text-muted-foreground" },
      { variant: "tertiary", intent: "success", className: "text-success" },
      { variant: "tertiary", intent: "danger", className: "text-destructive" },
      { variant: "tertiary", intent: "warning", className: "text-warning" },
      { variant: "tertiary", intent: "info", className: "text-info" },
    ],
    defaultVariants: { variant: "primary", intent: "neutral", size: "default" },
  }
);

export type ButtonEmphasis = "primary" | "secondary" | "tertiary";
export type ButtonIntent = "neutral" | "success" | "danger" | "warning" | "info";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">,
    Omit<VariantProps<typeof buttonVariants>, "variant" | "intent"> {
  variant?: ButtonEmphasis;
  intent?: ButtonIntent;
  asChild?: boolean;
  /** The NATIVE button type - never shadowed by the emphasis axis. */
  type?: "button" | "submit" | "reset";
}

interface IconProps {
  icon: React.ElementType;
  /** Defaults to leading (Jacob, 2026-08-30). */
  iconPlacement?: "left" | "right";
  iconSize?: number;
}
interface IconRefProps {
  icon?: never;
  iconPlacement?: undefined;
  iconSize?: never;
}
export type ButtonIconProps = IconProps | IconRefProps;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps & ButtonIconProps>(
  ({ className, variant, intent, size, icon: Icon, iconPlacement = "left", iconSize, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, intent, size, className }))}
        ref={ref}
        {...props}
      >
        {Icon && iconPlacement === "left" && <Icon size={iconSize} />}
        <Slottable>{props.children}</Slottable>
        {Icon && iconPlacement === "right" && <Icon size={iconSize} />}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
