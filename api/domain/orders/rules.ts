// The order rules: pure functions, no database, no request, no provider.
// PURCHASE AND SALE DIFFER BY ONE COLUMN (Jacob), so `direction` is an ARGUMENT
// rather than a pair of files. Money arithmetic stays in domain/pricing.
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import type { PricedLine } from "#db/orders/items/repo.ts";

export type Direction = "purchase" | "sale";

// We BID to buy metal from a customer and ASK to sell it to them.
export function spotSideFor(direction: Direction): "bid" | "ask" {
  return direction === "purchase" ? "bid" : "ask";
}

// EVERY LINE OF A PURCHASE PRICES FROM rates.rates (Jacob, 2026-09-03), tiered
// by the order's TOTAL content of that metal: a scrap line takes the band's
// scrap_pct and a bullion line its bullion_pct. The PRODUCT'S bid_premium plays
// NO PART in what a purchase pays - it is a catalogue figure, not a price fact.
// A sale still takes the product's ask premium.
//
// This corrects the earlier rule, which let purchase bullion keep the
// product's bid_premium and so paid a customer a number the rates table never
// agreed to. The storefront quote already priced bullion from bullion_pct
// (domain/quotes, pinned by quotes/tests/replay.test.ts), so the order is being
// aligned to the quote rather than the other way round.
export type PremiumSource =
  | "rate-tier-scrap"
  | "rate-tier-bullion"
  | "product-ask-premium";

// WHICH PERCENTAGE COLUMN OF THE BAND A LINE READS. bullion_id is the one
// product reference a line carries and null means scrap (ruling 34c).
export function rateMaterialFor(line: { bullion_id?: string | null }): "scrap" | "bullion" {
  return line.bullion_id == null ? "scrap" : "bullion";
}

export function premiumSourceFor(
  direction: Direction, line: { bullion_id?: string | null }
): PremiumSource {
  if (direction === "sale") return "product-ask-premium";
  return rateMaterialFor(line) === "scrap" ? "rate-tier-scrap" : "rate-tier-bullion";
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
export type { PricedLine } from "#db/orders/items/repo.ts";
export type RateBand = NonNullable<Parameters<typeof getRatePct>[0]>[number];

// WHAT A LINE CONTRIBUTES TO THE METAL TOTAL THE TIER IS READ AT. A scrap
// line's `content` already describes the whole lot, so quantity must NOT
// multiply it; a bullion line's is PER UNIT, so ten one-ounce coins are ten
// ounces of gold. That is the same asymmetry every sum in domain/pricing keeps.
export function lineContent(line: Pick<PricedLine, "content" | "quantity" | "bullion_id">): number {
  const content = Number(line.content) || 0;
  if (line.bullion_id == null) return content;
  const quantity = Number(line.quantity ?? 1);
  return content * (Number.isFinite(quantity) ? quantity : 1);
}

export function retierPlan(
  rates: RateBand[] | null | undefined, lines: PricedLine[]
): { id: string; premium: number }[] {
  if (!rates?.length || !lines.length) return [];
  const totals = sumContentByMetal(lines, (l: PricedLine) => l.metal, lineContent);
  const plan: { id: string; premium: number }[] = [];
  for (const line of lines) {
    const total = totals[String(line.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, line.metal, total, rateMaterialFor(line));
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
