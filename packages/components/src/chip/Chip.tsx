'use client'

// Chip - the drawing at 32:121: "Interactive pill for filters and selected
// values. Pill radius is deliberate - the theme reserves rounded-full for
// chips (Button squared off). Selected fills with primary; there is no accent
// hue since the gold is retired."
//
// INTERACTIVE is what separates it from Badge, so it is a real <button> with
// aria-pressed carrying the selection - a filter chip is a toggle, and a
// screen reader should hear "pressed". The optional dismiss is its own small
// button (stopPropagation, named by its label), because dismissing and
// toggling are different acts on one pill.
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../cn";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: React.ReactNode;
  selected?: boolean;
  onDismiss?: () => void;
};

export function Chip({ label, selected = false, onDismiss, className, disabled, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-small font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "bg-primary text-primary-foreground hover:bg-neutral-800"
          : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
      {...props}
    >
      {label}
      {onDismiss && (
        <span
          role="button"
          aria-label={`Remove ${typeof label === "string" ? label : "chip"}`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDismiss();
            }
          }}
          className="-mr-1 flex size-4 items-center justify-center rounded-full hover:bg-black/10"
        >
          <X aria-hidden className="size-3.5" />
        </span>
      )}
    </button>
  );
}
