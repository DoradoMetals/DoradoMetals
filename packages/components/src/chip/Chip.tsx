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
import { Button } from "../button/Button";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: React.ReactNode;
  selected?: boolean;
  onDismiss?: () => void;
  /** Leading 12px icon; inherits the text colour. */
  icon?: React.ReactNode;
  /** Leading 16px avatar (people/entity chips); wins over icon. */
  avatar?: React.ReactNode;
  /** Trailing count for filter chips - "Gold 12". Micro, tabular. */
  count?: number;
};

export function Chip({ label, selected = false, onDismiss, icon, avatar, count, className, disabled, ...props }: ChipProps) {
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
          ? "bg-primary text-primary-foreground hover:opacity-85"
          : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
      {...props}
    >
      {avatar != null ? (
        <span className="-ml-1.5 flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full [&_img]:size-full [&_img]:object-cover">
          {avatar}
        </span>
      ) : icon != null ? (
        <span className="shrink-0 [&_svg]:size-3">{icon}</span>
      ) : null}
      {label}
      {count != null && <span className="text-micro tabular-nums opacity-70">{count}</span>}
      {onDismiss && (
        // A real Button, like Alert's and Attachment's dismiss - it gets the
        // focus ring and the disabled handling for free. asChild because a
        // <button> cannot nest inside the chip's own <button>.
        <Button
          asChild
          variant="tertiary"
          size="iconXs"
          className="-mr-1 size-4"
          aria-label={`Remove ${typeof label === "string" ? label : "chip"}`}
        >
          <span
            role="button"
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
          >
            <X aria-hidden className="size-3" />
          </span>
        </Button>
      )}
    </button>
  );
}
