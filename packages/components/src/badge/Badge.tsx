// Badge - the drawing at 32:83: "Small non-interactive status label. Variant
// is the treatment (Solid / Soft / Outline), Intent is the meaning - same
// two-axis language as Button. Soft uses the hue at 16% over the page ground.
// Radius is radius/sm, not a pill: pills are reserved for chips."
//
// Non-interactive is the point: no hover, no focus, no cursor. A badge that
// wants a click is a Chip or a Button wearing the wrong name.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-micro font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: { solid: "", soft: "", outline: "border" },
      intent: { neutral: "", success: "", danger: "", warning: "", info: "" },
    },
    compoundVariants: [
      { variant: "solid", intent: "neutral", className: "bg-secondary text-foreground" },
      { variant: "soft", intent: "neutral", className: "bg-border text-foreground" },
      { variant: "outline", intent: "neutral", className: "border-border text-foreground" },

      { variant: "solid", intent: "success", className: "bg-success text-success-foreground" },
      { variant: "soft", intent: "success", className: "bg-success/15 text-success" },
      { variant: "outline", intent: "success", className: "border-success text-success" },

      { variant: "solid", intent: "danger", className: "bg-destructive text-destructive-foreground" },
      { variant: "soft", intent: "danger", className: "bg-destructive/15 text-destructive" },
      { variant: "outline", intent: "danger", className: "border-destructive text-destructive" },

      { variant: "solid", intent: "warning", className: "bg-warning text-warning-foreground" },
      { variant: "soft", intent: "warning", className: "bg-warning/15 text-warning" },
      { variant: "outline", intent: "warning", className: "border-warning text-warning" },

      { variant: "solid", intent: "info", className: "bg-info text-info-foreground" },
      { variant: "soft", intent: "info", className: "bg-info/15 text-info" },
      { variant: "outline", intent: "info", className: "border-info text-info" },
    ],
    defaultVariants: { variant: "soft", intent: "neutral" },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** Leading icon slot (Jacob, 2026-08-30). Sized to the micro text - 12px -
     *  and it inherits the variant's text colour, so a soft danger badge gets
     *  a destructive icon for free. */
    icon?: React.ReactNode;
  };

export function Badge({ className, variant, intent, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, intent }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export { badgeVariants };
