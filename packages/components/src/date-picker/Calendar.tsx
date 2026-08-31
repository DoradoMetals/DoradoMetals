'use client'

// Calendar - the drawings at 49:100 and 47:21: card panel, H5 month, 40x40 day
// cells on radius/sm. "Today reads as a border/strong outline; Selected fills
// with primary. Outside covers days from the adjacent month; Disabled is
// Outside plus 40% opacity. No brand hue - the gold is retired."
//
// react-day-picker underneath, exactly as the app already had: the grid math,
// the keyboard navigation and the aria grid semantics are a solved problem,
// and hand-rolling week arithmetic is how calendars get February wrong. This
// file is the drawing expressed as its classNames map; the header chevrons are
// our Button. (The drawing's chevron-down-rotated-90 was a Figma icon-set
// workaround its own description apologises for - code has real ChevronLeft.)
import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../cn";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit rounded-lg border border-border bg-card p-4", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex h-6 items-center justify-center",
        caption_label: "text-h5 font-semibold text-foreground",
        nav: "absolute inset-x-4 flex items-center justify-between",
        button_previous:
          "z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        button_next:
          "z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        month_grid: "w-full border-collapse",
        weekdays: "flex gap-0.5",
        weekday: "h-5 flex-1 text-micro font-medium text-muted-foreground",
        weeks: "flex flex-col gap-0.5",
        week: "flex gap-0.5",
        day: "flex-1 p-0",
        day_button:
          "flex size-10 w-full cursor-pointer items-center justify-center rounded-sm text-small text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        today: "[&>button]:border [&>button]:border-border-strong [&>button]:font-medium",
        selected:
          "[&>button]:bg-primary [&>button]:font-medium [&>button]:text-primary-foreground [&>button:hover]:bg-primary",
        outside: "[&>button]:text-muted-foreground",
        disabled: "[&>button]:pointer-events-none [&>button]:text-muted-foreground [&>button]:opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft aria-hidden className="size-4" {...rest} />
          ) : (
            <ChevronRight aria-hidden className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
