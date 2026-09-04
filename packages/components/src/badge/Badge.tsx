import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md font-medium whitespace-nowrap [&_svg]:shrink-0",
  {
    variants: {
      variant: { solid: "", soft: "", outline: "border" },
      intent: { neutral: "", success: "", danger: "", warning: "", info: "" },
      size: {
        sm: "gap-1 px-1.5 py-0.5 text-micro [&_svg]:size-2.5",
        default: "gap-1 px-2 py-0.5 text-micro [&_svg]:size-3",
        lg: "gap-1.5 px-2.5 py-1 text-small [&_svg]:size-3.5",
      },
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
    defaultVariants: { variant: "soft", intent: "neutral", size: "default" },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    icon?: React.ReactNode;
  };

export function Badge({ className, variant, intent, size, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, intent, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export { badgeVariants };
