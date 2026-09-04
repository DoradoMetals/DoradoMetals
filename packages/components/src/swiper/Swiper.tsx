'use client'

import * as React from "react";
import { cn } from "../cn";
import { useDragScroll } from "./hooks/useDragScroll";

export type SwiperProps = {
  children: React.ReactNode;
  label: string;
  className?: string;
  slideClassName?: string;
};

export function Swiper({ children, label, className, slideClassName }: SwiperProps) {
  const { ref, dragging, handlers } = useDragScroll<HTMLDivElement>();
  const slides = React.Children.toArray(children);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      {...handlers}
      className={cn(
        "flex gap-3 overflow-x-auto px-4 scroll-smooth motion-reduce:scroll-auto",
        "cursor-grab [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        dragging && "cursor-grabbing select-none",
        className
      )}
    >
      {slides.map((slide, i) => (
        <div key={i} className={cn("w-auto shrink-0", slideClassName)}>
          {slide}
        </div>
      ))}
    </div>
  );
}
