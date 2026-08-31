'use client'

// OTP Input - the drawings at 96:32 and 96:18: cells fill the row evenly,
// "Focus reads as a 1.5px border/strong ring rather than a glow, matching
// Input. Empty hides the digit rather than showing a placeholder character."
//
// ONE HIDDEN INPUT, drawn as cells. To assistive tech and to the platform this
// is a single text field - autocomplete="one-time-code" so iOS/Android offer
// the SMS code, inputMode numeric for the right keyboard, paste Just Works,
// backspace walks left - and the cells are a rendering of its value. Splitting
// into six real inputs breaks every one of those.
import * as React from "react";
import { cn } from "./cn";

export type OTPInputProps = {
  length?: number;
  value: string;
  onValueChange: (value: string) => void;
  /** Fired once when every cell is filled. */
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function OTPInput({
  length = 6,
  value,
  onValueChange,
  onComplete,
  invalid = false,
  disabled = false,
  label = "One-time code",
  className,
}: OTPInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);
  const digits = value.slice(0, length).split("");
  const activeIndex = Math.min(digits.length, length - 1);

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onValueChange(clean);
    if (clean.length === length && clean !== value) onComplete?.(clean);
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="\d*"
        maxLength={length}
        className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
      />
      <div aria-hidden className={cn("flex items-center gap-2", disabled && "opacity-50")}>
        {Array.from({ length }, (_, i) => {
          const isActive = focused && i === activeIndex && !disabled;
          return (
            <span
              key={i}
              className={cn(
                "flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg bg-card text-h3 font-semibold text-foreground",
                invalid
                  ? "border-[1.5px] border-destructive"
                  : isActive
                  ? "border-[1.5px] border-border-strong"
                  : "border border-border"
              )}
            >
              {digits[i] ?? ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
