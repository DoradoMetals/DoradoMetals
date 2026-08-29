"use client"

import * as React from "react"

import { cn } from "@/shared/utils/cn"

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   WHAT THE 63 FLAGGED TABLE CALL SITES WERE ASKING FOR:
     Table       14x `font-normal text-neutral-700` — identical every time.
                 Now the default.
     TableRow    24x `hover:bg-transparent`. This is the interesting one: the
                 base row has NO hover rule at all, so all 24 were cancelling
                 a hover that does not exist — vestigial, inherited from the
                 shadcn original that did have `hover:bg-muted/50`. They are
                 no-ops and delete for free. Rows that genuinely ARE clickable
                 now say `interactive`, which is the hover those 24 were
                 avoiding, expressed as an opt-in.
     TableHead   6x `text-xs text-neutral-600 md:text-sm`  -> default.
     TableHeader 5x `text-xs text-neutral-700`             -> default.
     TableCell   5x `text-xs md:text-sm text-neutral-800`  -> default.
   Column ALIGNMENT (`text-left`/`text-center`/`text-right`) is layout and
   stays at the call site — there are 239 of those in the tree and they are not
   typography. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", className)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-small font-normal text-neutral-700")}
        {...props}
      />
    </div>
  )
}

/* A STICKY HEADER NEEDS A GROUND, or the rows scroll THROUGH it - which is why
   one call site had reached for `bg-neutral-50`, a near-WHITE band across a
   dark table after the ramp inversion. `surface` names the three real answers
   in tokens; `transparent` stays the default so no existing header moves. */
function TableHeader({
  className,
  surface = "transparent",
  ...props
}: React.ComponentProps<"thead"> & {
  surface?: "transparent" | "card" | "highest"
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b text-micro text-neutral-700",
        surface === "card" && "bg-card",
        surface === "highest" && "bg-highest",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/* THE ROW'S TWO REMAINING STATES, both of which were className strings at the
   two order drawers until now.

   `intent` is the HOUSE AXIS (ruling 25), generated from one rule rather than
   hand-tuned per colour: a tinted ground at 10% and a hover one step up at
   20%. Only `success` has a caller today (a confirmed scrap or bullion line),
   and that is exactly why it should not be a `confirmed` boolean - the next
   one will be a rejected line, and a second boolean is how a component ends up
   with four states and two of them meaningless.

   `disabled` replaces `opacity-50 pointer-events-none` spelled at the call
   site, and carries `aria-disabled` with it so the visual state and the
   assistive one cannot disagree - the same pairing `NavLink` makes for
   `aria-current`. */
const ROW_INTENTS = {
  neutral: "",
  brand: "bg-brand/10 hover:bg-brand/20",
  success: "bg-success/10 hover:bg-success/20",
  danger: "bg-destructive/10 hover:bg-destructive/20",
  warning: "bg-warning/10 hover:bg-warning/20",
  info: "bg-info/10 hover:bg-info/20",
} as const

function TableRow({
  className,
  interactive = false,
  borderless = false,
  intent = "neutral",
  disabled = false,
  ...props
}: React.ComponentProps<"tr"> & {
  /** Clickable: pointer cursor + a hover fill. Opt-in, never inferred. */
  interactive?: boolean
  /** Drops the rule under the row - for summary and layout tables that use
   *  `<table>` for alignment rather than to present a grid of records.
   *  Previously spelled `border-none`/`border-b-0` at call sites. */
  borderless?: boolean
  /** Tints the row to MEAN something - a confirmed line, a rejected one. */
  intent?: keyof typeof ROW_INTENTS
  /** Dimmed and not addressable, e.g. a row outside the current selection
   *  while a table is in edit mode. */
  disabled?: boolean
}) {
  return (
    <tr
      data-slot="table-row"
      aria-disabled={disabled || undefined}
      className={cn(
        "data-[state=selected]:bg-muted transition-colors",
        borderless ? "border-b-0" : "border-b border-border",
        interactive && "cursor-pointer hover:bg-accent",
        ROW_INTENTS[intent],
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-micro md:text-small text-neutral-600 h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "text-micro md:text-small text-neutral-800 p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-small", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
