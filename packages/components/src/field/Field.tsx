// The field chassis - Popover Field in the Figma (106:213): "A field that
// opens a panel: the shared shape behind Select, Autocomplete, and the date
// and time pickers. The Panel is an INSTANCE_SWAP slot - point it at Select
// Menu, Calendar, Date & Time Picker or any list and the trigger stays
// identical."
//
// This file is that sentence as code: the label, the h-11 card trigger, the
// popover panel and the option row are ONE set of classes, and Select,
// Autocomplete and the pickers wear them. Behaviour deliberately lives with
// each widget - a listbox, a filtering combobox and a date grid are three
// different machines to a keyboard - so this exports STYLES and dumb pieces,
// never state.
import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../cn";

/** The trigger box. States ride data-/aria- attributes so any primitive can
 *  drive them: Radix sets data-state and aria-invalid/disabled for free. */
export const fieldTrigger = cva(
  cn(
    "flex h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 text-body text-foreground transition-colors",
    // FOCUS IS THE PRIMARY BORDER (Jacob, 2026-08-30) - the one state that
    // may outrank the neutral ramp.
    "border-input focus-within:border-primary focus-visible:outline-none focus-visible:border-primary",
    "aria-[invalid=true]:border-destructive data-[invalid]:border-destructive",
    "disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  )
);

/** The panel: surface/popover split by border, never shadow (ruling 27). */
export const fieldPanel = cva(
  "z-50 flex flex-col gap-2 rounded-lg border border-border bg-popover p-2"
);

/** One option row - Select Option (38:18): hover fills with accent, selection
 *  is a trailing check ("no radio dot - the check carries selection"). */
export const fieldOption = cva(
  cn(
    "flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-body text-muted-foreground outline-none",
    "data-[highlighted]:bg-accent data-[highlighted]:text-foreground hover:bg-accent hover:text-foreground",
    "data-[state=checked]:text-foreground aria-[selected=true]:text-foreground",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  )
);

export function FieldLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-small font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
