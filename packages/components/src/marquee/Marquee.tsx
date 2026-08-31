'use client'

// Marquee - the Figma component (170:48, drawn 2026-08-30): the scrolling
// strip. Continuous translateX loop, content duplicated for the seam, PAUSES
// on hover and focus-within, and under motion-reduce it does not move at all
// - it becomes a static row with overflow scroll. The component renders
// children; it never fetches.
import * as React from "react";

import { cn } from "../cn";

export type MarqueeProps = {
  children: React.ReactNode;
  /** Seconds per full cycle. */
  duration?: number;
  className?: string;
};

export function Marquee({ children, duration = 30, className }: MarqueeProps) {
  return (
    <div
      className={cn(
        "group flex w-full overflow-x-auto border-y border-border py-3",
        "motion-safe:overflow-hidden",
        className
      )}
    >
      <div
        className="flex shrink-0 items-center gap-10 pr-10 motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {children}
      </div>
      {/* The seam copy - decoration only, hidden from AT. */}
      <div
        aria-hidden
        className="hidden shrink-0 items-center gap-10 pr-10 motion-safe:flex motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {children}
      </div>
    </div>
  );
}
