'use client'

// Empty State - the Figma set (127:49, revised 2026-08-30): the absence
// explained. The icon is BARE and BIG - a 32px glyph at muted, no tile, no
// background - optional, and a SLOT (any icon from the library, chosen per
// surface). One action at most: an empty state is a signpost, not a menu.
import * as React from "react";

import { cn } from "../cn";

export type EmptyStateProps = {
  /** Bare 32px glyph, muted. Omit for text-only. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** ONE action, a real Button - Primary when it is the page's point. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-12 py-9 text-center", className)}>
      {icon != null && (
        <span aria-hidden className="text-muted-foreground [&_svg]:size-8">
          {icon}
        </span>
      )}
      <span className="flex max-w-sm flex-col gap-1">
        <span className="text-h5 font-medium text-foreground">{title}</span>
        {children != null && <span className="text-small text-muted-foreground">{children}</span>}
      </span>
      {action}
    </div>
  );
}
