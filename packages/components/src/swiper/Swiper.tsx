'use client'

// Swiper - the drawing at 59:63: a horizontal snap carousel where "the next
// card peeks at the right edge - the affordance that tells a user it scrolls"
// and "pagination widens the active dot rather than only recolouring it, so
// position is readable without relying on colour."
//
// The drawing's own IMPORTANT note hands the behaviour to code: drag, momentum
// and snap are CSS scroll-snap here - native momentum, native touch, zero
// dependency - with the peek coming from the track's padding and each slide's
// snap-start. The dots are real buttons that jump their page, the track is a
// listbox-free region (a carousel is content, not a widget), and
// scroll-behavior collapses under motion-reduce.
import * as React from "react";
import { cn } from "../cn";

export type SwiperProps = {
  children: React.ReactNode;
  /** Accessible name for the region - "Metal types", "Product photos". */
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
      track.scrollTo({ left: kid.offsetLeft - track.offsetLeft, behavior: "smooth" });
    }
  };

  return (
    <div role="region" aria-label={label} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth motion-reduce:scroll-auto",
          // The peek: padding keeps the next card's edge visible, and hides the
          // scrollbar the snap replaces.
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
              "h-1.5 cursor-pointer rounded-full transition-all motion-reduce:transition-none",
              i === page ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground"
            )}
          />
        ))}
      </div>
    </div>
  );
}
