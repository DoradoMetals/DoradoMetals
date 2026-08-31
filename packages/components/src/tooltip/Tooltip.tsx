'use client'

// Tooltip - the drawing at 32:177: "Hover hint on surface/highest - the top of
// the elevation stack - separated by a border rather than a shadow (elevation
// shadows are retired, ruling 27). The arrow is a rotated square; it overlaps
// the bubble border slightly by design."
//
// Radix underneath: hover AND focus open it (a hint only mouse users get is
// half a hint), Escape dismisses, and the content is wired to the trigger for
// assistive tech. The rotated-square arrow is drawn with a plain span because
// Radix's Arrow is an unborderable polygon.
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  delayDuration?: number;
};

export function Tooltip({ content, side = "top", children, delayDuration = 300 }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-sm border border-border bg-highest px-3 py-2 text-small text-foreground",
            "data-[state=delayed-open]:animate-in motion-reduce:animate-none"
          )}
        >
          {content}
          {/* The direction indicator is BACK as a normal arrow (Jacob,
              2026-08-31) - Radix positions it at the anchor; it wears the
              panel's own surface. */}
          <TooltipPrimitive.Arrow className="fill-highest" width={12} height={6} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
