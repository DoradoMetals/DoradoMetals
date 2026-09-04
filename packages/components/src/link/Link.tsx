'use client'

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { ExternalLink } from "@dorado/icons";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const linkVariants = cva(
  "cursor-pointer text-small font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  {
    variants: {
      intent: {
        neutral: "text-foreground",
        muted: "text-muted-foreground hover:text-foreground",
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
  external?: boolean;
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, intent, asChild = false, external = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return (
      <Comp
        className={cn(external && "inline-flex items-center gap-[5px]", linkVariants({ intent, className }))}
        ref={ref}
        {...props}
      >
        {external && <ExternalLink aria-hidden className="size-3 shrink-0" />}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  }
);
Link.displayName = "Link";

export { Link, linkVariants };
