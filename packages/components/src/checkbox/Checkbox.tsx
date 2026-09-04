'use client'

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "../icons";
import { cn } from "../cn";

export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 cursor-pointer rounded-sm border border-border bg-card outline-none transition-colors",
        "data-[state=unchecked]:hover:border-border-strong data-[state=unchecked]:hover:bg-accent",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=checked]:hover:opacity-85",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed",
        "disabled:data-[state=unchecked]:bg-muted",
        "disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong disabled:data-[state=checked]:text-muted-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check aria-hidden className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
