import * as React from "react";
import { type Format } from "@number-flow/react";
import { cn } from "../cn";
import { Amount } from "../amount/Amount";

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
      <small>{label}</small>
      <span className={cn("flex items-center gap-2", centered && "justify-center")}>
        <span className={size === "default" ? "stat" : "stat-sm"}>
          {typeof value === "number" ? <Amount value={value} format={format} /> : value}
        </span>
        {trend && (
          <span
            className={cn(
              "micro tabular-nums",
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
