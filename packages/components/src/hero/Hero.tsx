'use client'

// Hero - the Figma component (163:35, redrawn 2026-09-03). Centered column on
// the page ground - no gradient wash, no glow; the TYPE is the hero (display at
// 44/50 with -1.2 tracking, stepping to 32/38 on mobile).
//
// THIS COMPONENT IS OPINIONATED (Jacob, 2026-09-03): it takes no optional
// props. The words, the two CTAs and their destinations are the drawing's, not
// a call site's - there is one landing hero and this is it. A surface that
// wants different words wants a different component.
//
// THE ONE PROP is the count, and it is REQUIRED for the reason the drawing
// states: "The proof numbers are the app's to supply - never hardcode a count
// that drifts." Baking 2,400 in here would make the trust line a lie the day
// it moves.
import * as React from "react";

import { Badge } from "../badge/Badge";
import { Button } from "../button/Button";

export type HeroProps = {
  /** Sellers served. The app supplies it; the component never invents it. */
  sellerCount: number;
};

export function Hero({ sellerCount }: HeroProps) {
  return (
    <section className="flex flex-col items-center gap-5 bg-background px-6 py-16 text-center sm:p-24">
      <Badge>Live spot pricing, locked at checkout</Badge>

      <h1 className="max-w-2xl text-balance text-display-sm font-semibold text-foreground sm:text-display">
        Sell your precious metals without the guesswork
      </h1>

      <p className="max-w-xl text-balance text-h5 text-muted-foreground">
        Insured shipping, transparent assay, and payout the day your metal arrives.
      </p>

      {/* Layout belongs to the call site and this IS the call site: the CTAs
          stack full-width on mobile and sit side by side from sm up. */}
      <div className="flex w-full flex-col items-stretch gap-2.5 pt-2 sm:w-auto sm:flex-row sm:items-start">
        <Button asChild size="lg" variant="primary" className="w-full sm:w-auto">
          <a href="/sell">Get a Quote</a>
        </Button>
        <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
          <a href="/buy">Browse bullion</a>
        </Button>
      </div>

      <p className="text-micro text-placeholder">
        Trusted by {sellerCount.toLocaleString("en-US")}+ sellers · A+ BBB · Fully insured
      </p>
    </section>
  );
}
