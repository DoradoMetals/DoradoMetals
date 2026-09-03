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
