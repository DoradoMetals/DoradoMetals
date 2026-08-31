'use client'

// Time Picker - the drawings at 55:50/55:15: an appointment grid grouped by
// part of day, pairing with Calendar. Selected fills with primary "matching
// every other selection control in the library"; Unavailable is muted at 50% -
// "visibly present but clearly not choosable, which is better than hiding it
// because it shows the day is busy."
//
// The slots are a RADIO GROUP to assistive tech - one appointment, one choice
// - rendered as real buttons with aria-pressed, unavailable ones disabled
// rather than removed (the drawing's own argument). The grouping is the
// caller's data; three columns is the drawn rhythm.
import * as React from "react";
import { cn } from "../cn";

export type TimeSlotShape = { value: string; label: string; available?: boolean };
export type TimeGroup = { label: string; slots: TimeSlotShape[] };

export type TimePickerProps = {
  /** e.g. "Thursday, 18 June" */
  heading?: React.ReactNode;
  groups: TimeGroup[];
  value?: string | null;
  onValueChange: (value: string) => void;
  className?: string;
};

export function TimePicker({ heading, groups, value, onValueChange, className }: TimePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={typeof heading === "string" ? heading : "Appointment time"}
      className={cn("flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4", className)}
    >
      {heading != null && <h3 className="text-h5 font-semibold text-foreground">{heading}</h3>}
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <span className="text-micro font-medium text-muted-foreground">{group.label}</span>
          <div className="grid grid-cols-3 gap-2">
            {group.slots.map((slot) => {
              const available = slot.available !== false;
              const selected = slot.value === value;
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!available}
                  onClick={() => onValueChange(slot.value)}
                  className={cn(
                    "flex h-10 cursor-pointer items-center justify-center rounded-sm text-small font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : available
                      ? "border border-border bg-card text-foreground hover:bg-accent"
                      : "border border-border bg-muted text-muted-foreground opacity-50"
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
