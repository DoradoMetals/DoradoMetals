'use client'

import * as React from "react";

import { cn } from "../cn";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  badge,
  title,
  description,
  children,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-lg px-2xl py-xl text-center", className)}>
      {icon != null && (
        <div className="relative">
          <span aria-hidden className="text-muted-foreground [&_svg]:size-16">
            {icon}
          </span>
          {badge != null && (
            <span className="absolute -top-3 -right-2 flex size-5 items-center justify-center rounded-full border border-border-strong text-micro font-medium text-foreground">
              {badge}
            </span>
          )}
        </div>
      )}
      <span className="flex max-w-sm flex-col gap-2xs">
        <span className="text-h5 font-semibold text-foreground">{title}</span>
        {description != null && (
          <span className="text-small text-muted-foreground">{description}</span>
        )}
        {children != null && <span className="text-small text-muted-foreground">{children}</span>}
      </span>
      {action}
    </div>
  );
}
