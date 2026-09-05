'use client'

import * as React from "react";

import { cn } from "../cn";

export type MarqueeProps = {
  children: React.ReactNode;
  duration?: number;
  className?: string;
};

export function Marquee({ children, duration = 30, className }: MarqueeProps) {
  return (
    <div
      className={cn(
        "group flex w-full overflow-x-auto border-y border-border px-6 py-3",
        "motion-safe:overflow-hidden",
        className
      )}
    >
      <div
        className="flex shrink-0 items-center gap-8 pr-8 motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {children}
      </div>
      <div
        aria-hidden
        className="hidden shrink-0 items-center gap-8 pr-8 motion-safe:flex motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {children}
      </div>
    </div>
  );
}
