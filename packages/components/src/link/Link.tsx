'use client'

// Link - the drawing at 6:307, and deliberately NOT a Button variant: "a link
// navigates, a button acts." No box, no padding, no radius, no border.
// Underline appears on hover only. Intent supplies text colour and nothing
// else.
//
// Renders an <a>; pass asChild to wrap a framework Link (next/link) and keep
// its navigation semantics.
import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { ExternalLink } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

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
  /** Leading external-link glyph for links that leave the app (Jacob,
   *  2026-08-30). Decoration only - target/rel are still the caller's. */
  external?: boolean;
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, intent, asChild = false, external = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return (
      <Comp
        className={cn(external && "inline-flex items-center gap-1", linkVariants({ intent, className }))}
        ref={ref}
        {...props}
      >
        {external && <ExternalLink aria-hidden className="size-2.5 shrink-0" />}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  }
);
Link.displayName = "Link";

export { Link, linkVariants };
