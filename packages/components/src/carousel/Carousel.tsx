'use client'

import * as React from "react";
import { ChevronLeft, ChevronRight } from "../icons";
import { Button } from "../button/Button";
import { cn } from "../cn";
import { useDragScroll } from "../hooks/useDragScroll";

export type CarouselProps = {
  children: React.ReactNode;
  label: string;
  className?: string;
  slideClassName?: string;
  showArrows?: boolean;
  showDots?: boolean;
  arrowsClassName?: string;
  dotsClassName?: string;
};

export function Carousel({
  children,
  label,
  className,
  slideClassName,
  showArrows = true,
  showDots = true,
  arrowsClassName,
  dotsClassName,
}: CarouselProps) {
  const { ref, dragging, handlers } = useDragScroll<HTMLDivElement>();
  const slides = React.Children.toArray(children);
  const count = slides.length;
  const slideRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const [page, setPage] = React.useState(0);

  const atStart = page <= 0;
  const atEnd = page >= count - 1;

  const goTo = React.useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), count - 1);
      setPage(clamped);
      slideRefs.current[clamped]?.scrollIntoView({ block: "nearest", inline: "start" });
    },
    [count]
  );

  return (
    <div className={cn("flex flex-col items-start gap-sm w-full", className)}>
      <div className="relative w-full overflow-x-hidden">
        <div
          ref={ref}
          role="region"
          aria-label={label}
          aria-roledescription="carousel"
          tabIndex={0}
          {...handlers}
          className={cn(
            "flex gap-sm overflow-x-auto snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto",
            "cursor-grab [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            dragging && "cursor-grabbing select-none"
          )}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              className={cn("shrink-0 snap-start", slideClassName)}
            >
              {slide}
            </div>
          ))}
        </div>

        {showArrows && count > 1 && (
          <>
            <Button
              type="button"
              variant="tertiary"
              size="icon"
              aria-label="Previous slide"
              disabled={atStart}
              onClick={(e) => {
                e.stopPropagation();
                goTo(page - 1);
              }}
              className={cn("absolute left-2 top-1/2 -translate-y-1/2", arrowsClassName)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="icon"
              aria-label="Next slide"
              disabled={atEnd}
              onClick={(e) => {
                e.stopPropagation();
                goTo(page + 1);
              }}
              className={cn("absolute right-2 top-1/2 -translate-y-1/2", arrowsClassName)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </>
        )}
      </div>

      {showDots && count > 1 && (
        <div className={cn("flex w-full items-center justify-center gap-xs", dotsClassName)}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1} of ${count}`}
              aria-current={i === page ? "true" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
              }}
              className={cn(
                "shrink-0 rounded-full transition-all",
                i === page ? "size-2 bg-primary" : "size-1.5 bg-muted-foreground/40"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
