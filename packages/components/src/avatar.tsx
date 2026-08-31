'use client'

// Avatar - the drawing at 32:147: "User avatar with initials fallback. Sizes
// XS 24 / SM 32 / MD 40 / LG 56. Circle radius is fixed geometry (half the
// width); Square binds radius/base. Drop an image fill on the frame to replace
// the initials."
//
// Kept on Radix (the general rule): Image handles the load/error lifecycle and
// Fallback only renders when the image has not - which is the "initials
// fallback" the drawing means, made real. The secondary surface, the hairline
// border and the Small/Medium initials are the drawing's.
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const avatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary",
  {
    variants: {
      size: {
        xs: "size-6 text-micro",
        sm: "size-8 text-micro",
        md: "size-10 text-small",
        lg: "size-14 text-small",
      },
      shape: {
        circle: "rounded-full",
        square: "rounded-lg",
      },
    },
    defaultVariants: { size: "md", shape: "circle" },
  }
);

export type AvatarProps = React.ComponentProps<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarVariants> & {
    src?: string;
    alt?: string;
    /** Shown until the image loads, or always without one - initials, an icon. */
    fallback?: React.ReactNode;
  };

export function Avatar({ className, size, shape, src, alt, fallback, children, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn(avatarVariants({ size, shape }), className)} {...props}>
      {src && (
        <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" />
      )}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center font-medium text-foreground">
        {fallback ?? children}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
