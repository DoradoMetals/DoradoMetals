'use client';

import * as React from "react";
import { ChevronLeft, ChevronRight } from "../icons";

import { Button } from "../button/Button";
import { cn } from "../cn";

export type PaginationItemToken = number | "ellipsis";

export function getPaginationItems(page: number, pageCount: number): PaginationItemToken[] {
  const count = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(Math.floor(page), 1), count);

  const shown = new Set<number>([1, count]);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= count) shown.add(p);
  }

  const sorted = [...shown].sort((a, b) => a - b);
  const items: PaginationItemToken[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) items.push("ellipsis");
    items.push(p);
    previous = p;
  }
  return items;
}

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  const count = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(Math.floor(page), 1), count);
  const items = getPaginationItems(current, count);
  const atStart = current <= 1;
  const atEnd = current >= count;

  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-2xs", className)}>
      <Button
        type="button"
        variant="tertiary"
        size="iconSm"
        aria-label="Previous page"
        disabled={atStart}
        onClick={() => onPageChange(current - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden
            className="flex size-8 items-center justify-center text-small text-placeholder"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === current ? "page" : undefined}
            aria-label={`Page ${item}`}
            onClick={() => onPageChange(item)}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-lg text-small font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              item === current
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item}
          </button>
        ),
      )}
      <Button
        type="button"
        variant="tertiary"
        size="iconSm"
        aria-label="Next page"
        disabled={atEnd}
        onClick={() => onPageChange(current + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
