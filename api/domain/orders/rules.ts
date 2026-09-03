// The order rules: pure functions, no database, no request, no provider.
// PURCHASE AND SALE DIFFER BY ONE COLUMN (Jacob), so `direction` is an ARGUMENT
// rather than a pair of files. Money arithmetic stays in domain/pricing.
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import type { ScrapLine } from "#db/orders/items/repo.ts";

export type Direction = "purchase" | "sale";

// We BID to buy metal from a customer and ASK to sell it to them.
export function spotSideFor(direction: Direction): "bid" | "ask" {
  return direction === "purchase" ? "bid" : "ask";
}

// Scrap is tiered from the rates table by the order's total content of that
// metal; purchase bullion keeps its product's bid premium; a sale takes the ask.
export type PremiumSource = "rate-tier" | "line-premium" | "product-ask-premium";

export function premiumSourceFor(
  direction: Direction, line: { bullion_id?: string | null }
): PremiumSource {
  if (direction === "sale") return "product-ask-premium";
  return line.bullion_id == null ? "rate-tier" : "line-premium";
}

// SALES TAX IS CHARGED, NOT PAID: a payout to a customer never carries it.
export function chargesSalesTax(direction: Direction): boolean {
  return direction === "sale";
}

// Fine metal: the weight in troy ounces times the purity. NaN is "not measured"
// and must reach the database as NULL rather than as a number - D47/D65.
export function scrapContent(
  weight: number | null | undefined,
  unit: string | null | undefined,
  purity: number | null | undefined
): number | null {
  const value = convertTroyOz(weight as number, unit as string) * (purity as number);
  return Number.isFinite(value) ? value : null;
}

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S: tiered by the order's TOTAL
// content of that metal, so a submitted premium never decides what is paid.
//
// No rate bands means NO PLAN: an order placed with rates unconfigured keeps
// what it was given rather than being repriced to nothing.
// A type-only import, erased at runtime: this file still needs no database.
export type { ScrapLine } from "#db/orders/items/repo.ts";
export type RateBand = NonNullable<Parameters<typeof getRatePct>[0]>[number];

export function retierPlan(
  rates: RateBand[] | null | undefined, lines: ScrapLine[]
): { id: string; premium: number }[] {
  if (!rates?.length || !lines.length) return [];
  const totals = sumContentByMetal(
    lines,
    (l: ScrapLine) => l.metal,
    (l: ScrapLine) => Number(l.content) || 0
  );
  const plan: { id: string; premium: number }[] = [];
  for (const line of lines) {
    const total = totals[String(line.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, line.metal, total, "scrap");
    if (pct != null) plan.push({ id: line.id, premium: pct });
  }
  return plan;
}

// ONE QUOTE PER METAL THE ORDER ACTUALLY CONTAINS: a spot for a metal nobody
// sold is a row that means nothing.
export function spotsToFreeze(
  lines: { metal_id?: string | null }[],
  live: { id: string; ask?: number | null; bid?: number | null }[]
): { metal_id: string; ask: number | null; bid: number | null }[] {
  const quoted = new Map(live.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const frozen: { metal_id: string; ask: number | null; bid: number | null }[] = [];
  for (const line of lines) {
    const metal_id = line.metal_id;
    if (!metal_id || seen.has(metal_id)) continue;
    seen.add(metal_id);
    const spot = quoted.get(metal_id);
    frozen.push({ metal_id, ask: spot?.ask ?? null, bid: spot?.bid ?? null });
  }
  return frozen;
}

// ===========================================================================
// PAYMENT FACTS (D211 - statuses are flair; every decision is a payment fact)
// ===========================================================================

// SETTLED MEANS THE MONEY IS COMMITTED. `processing` counts: the funds are on
// their way, so the intent is no longer free to move to another order.
export function isSettled(payment_status: string | null | undefined): boolean {
  return payment_status === "succeeded" || payment_status === "processing";
}

export function chargeCents(post_charges_amount: number): number {
  return Math.round(post_charges_amount * 100);
}

// Stripe's floor is $0.50, and pricing caps applied credit so a card remainder
// is either 0 or at least that.
export const STRIPE_MINIMUM_CENTS = 50;

export function belowStripeMinimum(cents: number): boolean {
  return cents > 0 && cents < STRIPE_MINIMUM_CENTS;
}

// THE LABEL DERIVES FROM A MONEY FACT, not the method's name: nothing left to
// charge means nothing to await. Pending means AWAITING PAYMENT.
export function statusAtPlacement(cents: number, alreadySucceeded: boolean): string {
  return cents > 0 && !alreadySucceeded ? "Pending" : "Preparing";
}

// What an already-attached intent means for a new order. The intent is reused
// until it settles, so an abandoned checkout comes back still holding one.
//
//   conflict   it paid for something, or belongs to a purchase - a SETTLED
//              intent stays with the order it paid for, whatever label it wears
//   supersede  an unsettled sale paid for nothing: cancel, detach, proceed
//   proceed    nothing is attached
export type IntentFacts = {
  sales_order_id?: string | null;
  purchase_order_id?: string | null;
  payment_status?: string | null;
};

export function attachmentVerdict(
  intent: IntentFacts
): "proceed" | "supersede" | "conflict" {
  if (intent.purchase_order_id) return "conflict";
  if (!intent.sales_order_id) return "proceed";
  return isSettled(intent.payment_status) ? "conflict" : "supersede";
}

// A repair is honoured only at the price actually taken: if spot has moved since
// the charge, refuse rather than guess.
export function repairAmountMatches(
  intent_amount: number | string | null | undefined, cents: number
): boolean {
  return Number(intent_amount) === cents;
}
