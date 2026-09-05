'use client';

import * as React from "react";

import { cn } from "../cn";

export type BannerProps = {
  label: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function Banner({ label, eyebrow, title, description, action, className }: BannerProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-h-32 w-full flex-wrap items-center justify-between gap-lg border-y border-border bg-card px-3xl py-lg",
        className,
      )}
    >
      <span className="flex flex-col gap-3xs">
        {eyebrow != null && <span className="eyebrow text-placeholder">{eyebrow}</span>}
        <h4>{title}</h4>
        {description != null && <small>{description}</small>}
      </span>
      {action != null && <span className="shrink-0">{action}</span>}
    </section>
  );
}
