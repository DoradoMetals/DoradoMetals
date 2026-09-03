'use client'

import * as React from "react";
import { Slider } from "../slider/Slider";
import { cn } from "../cn";

export type SliderFieldProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label: string;
  disabled?: boolean;
  className?: string;
};

export function SliderField({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  label,
  disabled,
  className,
}: SliderFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = () => {
    if (draft == null) return;
    const n = Number(draft);
    if (Number.isFinite(n)) onValueChange(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };

  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <Slider
        value={[value]}
        onValueChange={([v]) => onValueChange(v!)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        className="flex-1"
      />
      <span
        className={cn(
          "flex h-10 w-21 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3",
          "focus-within:border-border-strong",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <input
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          disabled={disabled}
          inputMode="decimal"
          aria-label={`${label}${unit ? ` (${unit})` : ""}`}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none"
        />
        {unit && <span className="text-small text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}
