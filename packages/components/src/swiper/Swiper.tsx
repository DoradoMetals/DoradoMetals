'use client'

import * as React from "react";
import { cn } from "../cn";

export type SwiperProps = {
  children: React.ReactNode;
  label: string;
  className?: string;
};

export function Swiper({ children, label, className }: SwiperProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const slides = React.Children.toArray(children);
  const [page, setPage] = React.useState(0);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const kids = Array.from(track.children) as HTMLElement[];
    if (!kids.length) return;
    const x = track.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    kids.forEach((k, i) => {
      const d = Math.abs(k.offsetLeft - track.offsetLeft - x);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setPage(best);
  };

  const goTo = (i: number) => {
    const track = trackRef.current;
    const kid = track?.children[i] as HTMLElement | undefined;
    if (track && kid) {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      track.scrollTo({ left: kid.offsetLeft - track.offsetLeft, behavior: reduced ? "auto" : "smooth" });
    }
  };

  return (
    <div role="region" aria-label={label} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth motion-reduce:scroll-auto",
          "px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-4/5 max-w-60 shrink-0 snap-start">
            {slide}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1} of ${slides.length}`}
            aria-current={i === page || undefined}
            onClick={() => goTo(i)}
            className={cn(
              "cursor-pointer rounded-full transition-all motion-reduce:transition-none",
              i === page
                ? "size-2 bg-primary"
                : "size-1.5 bg-muted-foreground/40 hover:bg-muted-foreground"
            )}
          />
        ))}
      </div>
    </div>
  );
}
