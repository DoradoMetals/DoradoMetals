'use client'

import * as React from "react";

import { cn } from "../cn";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-6 px-12 py-9 text-center", className)}>
      {icon != null && (
        <span aria-hidden className="text-muted-foreground [&_svg]:size-16">
          {icon}
        </span>
      )}
      <span className="flex max-w-sm flex-col gap-1">
        <span className="text-h5 font-semibold text-foreground">{title}</span>
        {children != null && <span className="text-small text-muted-foreground">{children}</span>}
      </span>
      {action}
    </div>
  );
}
