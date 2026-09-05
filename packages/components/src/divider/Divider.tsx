'use client';

import * as React from "react";

import { cn } from "../cn";

export type DividerProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
  label?: React.ReactNode;
};

export function Divider({
  className,
  orientation = "horizontal",
  decorative = true,
  label,
  ...props
}: DividerProps) {
  const isVertical = orientation === "vertical";
  const semantics = decorative
    ? { role: "none" as const }
    : {
        role: "separator" as const,
        "aria-orientation": isVertical ? ("vertical" as const) : undefined,
      };

  if (label != null && !isVertical) {
    return (
      <div className={cn("flex items-center gap-sm", className)} {...semantics} {...props}>
        <span aria-hidden className="h-px min-w-px flex-1 bg-border" />
        <span className="micro shrink-0">{label}</span>
        <span aria-hidden className="h-px min-w-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div
      className={cn(isVertical ? "min-h-full w-px" : "h-px w-full", "bg-border", className)}
      {...semantics}
      {...props}
    />
  );
}
