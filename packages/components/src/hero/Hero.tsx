'use client'

// Hero - the Figma component (163:35, drawn 2026-08-30). Centered column on
// the page ground - no gradient wash, no glow; the TYPE is the hero. The
// proof numbers are the app's to supply: never hardcode a count that drifts.
import * as React from "react";

import { cn } from "../cn";

export type HeroProps = {
  /** The bordered-pill hook above the headline. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Real Buttons; primary first. Stack full-width on mobile. */
  actions?: React.ReactNode;
  /** The trust line - micro at placeholder. */
  footnote?: React.ReactNode;
  className?: string;
};

export function Hero({ eyebrow, title, subtitle, actions, footnote, className }: HeroProps) {
  return (
    <section className={cn("flex flex-col items-center gap-5 px-6 py-16 text-center sm:py-24", className)}>
      {eyebrow != null && (
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-micro font-medium text-muted-foreground">
          {eyebrow}
        </span>
      )}
      <h1 className="max-w-2xl text-h1 font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle != null && (
        <p className="max-w-xl text-body text-muted-foreground">{subtitle}</p>
      )}
      {actions != null && (
        <div className="flex w-full flex-col items-center gap-2.5 pt-2 sm:w-auto sm:flex-row">{actions}</div>
      )}
      {footnote != null && <span className="text-micro text-placeholder">{footnote}</span>}
    </section>
  );
}
