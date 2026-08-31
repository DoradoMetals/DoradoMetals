'use client'

// DatePicker - the Figma "Datepicker" set (104:438, renamed 2026-08-31):
// Calendar with the TimePicker moved in as an OPTIONAL addon. One visual
// card - zero gap, shared border, no floating islands: side-by-side on
// desktop (hairline between), stacked on small screens (hairline under the
// month grid). Date-only flows omit `timeGroups` and get the calendar alone.
import * as React from "react";

import { cn } from "../cn";
import { Calendar, type CalendarProps } from "./Calendar";
import { TimePicker, type TimeGroup } from "./TimePicker";

export type DatePickerProps = CalendarProps & {
  /** The optional time addon - omit for date-only. */
  timeGroups?: TimeGroup[];
  timeValue?: string | null;
  onTimeChange?: (value: string) => void;
  /** Heading over the slot column, e.g. the chosen day spelled out. */
  timeHeading?: React.ReactNode;
  className?: string;
};

export function DatePicker({
  timeGroups,
  timeValue,
  onTimeChange,
  timeHeading,
  className,
  ...calendar
}: DatePickerProps) {
  const withTimes = timeGroups != null && timeGroups.length > 0;
  return (
    <div
      className={cn(
        "inline-flex flex-col rounded-xl border border-border bg-card max-sm:w-full sm:flex-row",
        className,
      )}
    >
      <Calendar {...calendar} className={cn("p-2", calendar.classNames == null && "")} />
      {withTimes && (
        <div className="flex min-w-52 flex-col border-border max-sm:border-t sm:border-l">
          {timeHeading != null && (
            <div className="border-b border-border px-4 py-2 text-small font-medium text-foreground">
              {timeHeading}
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-2">
            <TimePicker
              groups={timeGroups}
              value={timeValue ?? null}
              onValueChange={(v) => onTimeChange?.(v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
