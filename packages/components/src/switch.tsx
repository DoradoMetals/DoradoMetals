'use client'

// Switch - the drawing at 17:14: "36x20 binary toggle. Pill radius is fixed
// geometry, not a token." Radix underneath: keyboard, form participation and
// the checked state machine are its; the drawing's geometry and the theme's
// colours are this file's.
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./cn";

export type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        "data-[state=unchecked]:bg-muted data-[state=unchecked]:border-border",
        "data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full transition-transform motion-reduce:transition-none",
          "data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-muted-foreground",
          "data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
