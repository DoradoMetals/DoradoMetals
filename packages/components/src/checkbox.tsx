'use client'

// Checkbox - the drawing at 15:16: "16x16 selection control for multi-select.
// Selected fills with primary and shows a check in primary-foreground." Radix
// underneath, exactly as the app's base/checkbox already had it - this move is
// the library taking ownership, not a rewrite. What travelled with it: the
// aria-invalid destructive language and the focus ring, the state axes the
// drawing carries (Default/Hover/Disabled) driven by Radix's own attributes.
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "./cn";

export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 cursor-pointer rounded-sm border border-input outline-none transition-colors",
        "hover:border-border-strong",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
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
