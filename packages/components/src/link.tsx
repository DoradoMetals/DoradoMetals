'use client'

// Link - the drawing at 6:307, and deliberately NOT a Button variant: "a link
// navigates, a button acts." No box, no padding, no radius, no border.
// Underline appears on hover only. Intent supplies text colour and nothing
// else.
//
// Renders an <a>; pass asChild to wrap a framework Link (next/link) and keep
// its navigation semantics.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const linkVariants = cva(
  "cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline",
  {
    variants: {
      intent: {
        // The nav/footer treatment: muted at rest, foreground on hover.
        neutral: "text-muted-foreground hover:text-foreground",
        foreground: "text-foreground",
        success: "text-success",
        danger: "text-destructive",
        warning: "text-warning",
        info: "text-info",
      },
    },
    defaultVariants: { intent: "neutral" },
  }
);

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  asChild?: boolean;
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, intent, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return <Comp className={cn(linkVariants({ intent, className }))} ref={ref} {...props} />;
  }
);
Link.displayName = "Link";

export { Link, linkVariants };
