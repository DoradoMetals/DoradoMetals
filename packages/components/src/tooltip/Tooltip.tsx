'use client'

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

          <TooltipPrimitive.Arrow width={12} height={6} className="fill-highest" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
