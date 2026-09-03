import * as React from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "../cn";

export type StatProps = {
  label: React.ReactNode;
  value: React.ReactNode | number;
  format?: Format;
  size?: "default" | "small";
  trend?: { direction: "up" | "down"; label: React.ReactNode };
  align?: "left" | "center";
  className?: string;
};

export function Stat({ label, value, format, size = "default", trend, align = "left", className }: StatProps) {
  const centered = align === "center";
  return (
    <div className={cn("flex flex-col gap-1", centered ? "items-center text-center" : "items-start", className)}>
      <span className="text-small tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("flex items-center gap-2", centered && "justify-center")}>
        <span className={cn("text-foreground", size === "default" ? "stat" : "stat-sm")}>
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
