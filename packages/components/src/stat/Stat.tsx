// Stat - the drawing at 53:39: "Display figure with a label and optional trend
// delta. Uses the Stat/Default (36px) and Stat/Small (30px) text styles, which
// exist precisely because a heading size is not a number size."
//
// The drawing's own IMPORTANT note says an animating figure needs tabular-nums
// "applied at the call site" because Figma cannot express it. Code can: the
// figure carries tabular-nums HERE, so no call site can forget it and no
// NumberFlow jitters mid-transition.
import * as React from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "../cn";

export type StatProps = {
  label: React.ReactNode;
  /** A NUMBER animates through NumberFlow (Jacob, 2026-08-31 - the base
   *  component owns the animation); any other node renders as-is. */
  value: React.ReactNode | number;
  /** Intl format for a numeric value - e.g. { style: "currency", currency: "USD" }. */
  format?: Format;
  size?: "default" | "small";
  /** e.g. "+2.4%" - success when up, destructive when down. */
  trend?: { direction: "up" | "down"; label: React.ReactNode };
  className?: string;
};

export function Stat({ label, value, format, size = "default", trend, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-small tracking-wider text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-wider text-foreground",
            size === "default" ? "text-stat" : "text-stat-sm"
          )}
        >
          {typeof value === "number" ? <NumberFlow value={value} format={format} /> : value}
        </span>
        {trend && (
          <span
            className={cn(
              "text-micro font-medium tabular-nums",
              trend.direction === "up" ? "text-success" : "text-destructive"
            )}
          >
            {trend.label}
          </span>
        )}
      </span>
    </div>
  );
}
