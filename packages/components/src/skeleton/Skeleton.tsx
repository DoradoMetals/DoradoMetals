// Skeleton - the drawing at 32:155: "Loading placeholder. Fills with secondary
// (a raised neutral surface) - STATIC, because the shimmer animation is
// retired. Resize freely; the shape variants are starting points, not fixed
// sizes."
//
// Static is the accessibility win too: nothing to motion-reduce. The shapes
// carry default geometry the caller resizes with layout classes.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const skeletonVariants = cva("bg-secondary", {
  variants: {
    shape: {
      text: "h-3 w-full rounded-sm",
      block: "h-20 w-full rounded-lg",
      circle: "size-10 rounded-full",
    },
  },
  defaultVariants: { shape: "text" },
});

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>;

export function Skeleton({ className, shape, ...props }: SkeletonProps) {
  return <div aria-hidden className={cn(skeletonVariants({ shape }), className)} {...props} />;
}
