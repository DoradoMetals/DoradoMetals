// The quote surface's pure decisions: what a line is worth on each side, and
// the refusals that stop a quote the placed order would not honour.
//
// NOTHING HERE READS A DATABASE OR A REQUEST. Every function takes rows and
// answers a number or throws.
import { Invalid } from "#shared/errors.ts";
import { getRatePct } from "#domain/rates/utils/resolveRate.ts";
import { fineContent } from "#domain/pricing/content.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { RateRead } from "@dorado/contracts";
import type { SpotWire } from "#domain/spots/compose.ts";

// Bid-side mirror of calculateItemAsk, stated here rather than imported:
// pricing/bid.ts's calculateTotalPrice prices SAVED order lines (frozen price,
// throws on a missing spot), and this surface needs the same `?? 0` stance as
// the ask side so both halves of one quote fail the same way.
export function bidPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  metal_name: string | null | undefined,
  spots: PricingSpot[]
): number {
  const spot = spots.find((s) => s.name === metal_name);
  return (content ?? 0) * ((spot?.bid ?? 0) * (premium ?? 0));
}

// The metal a spot prices, by the id the caller holds. A quote for a metal
// with no live spot would price at nothing, so it REFUSES rather than freezing
// a zero (D214 item 11: a missing input that would price at nothing throws).
export function requireSpot(spots: SpotWire[], metal_id: string): SpotWire {
  const spot = spots.find((s) => s.id === metal_id);
  if (!spot) throw new Invalid("that metal has no spot price today");
  return spot;
}

// The premium a purchase pays for one line: the rate band for its metal, at the
// order's TOTAL content of that metal.
//
// REFUSED RATHER THAN FALLING BACK, for bullion as well as scrap. This used to
// read `band ?? line.own_premium`, so a metal with no configured band quoted
// the product's catalogue bid_premium - a number the placed order would not
// pay, because a purchase prices every line from the rate tier. A quote the
// order will not honour is worse than no quote: the customer sees a figure,
// agrees to it, and is paid something else.
export function requireBandPremium(
  rates: RateRead[],
  metal_name: string,
  metalTotalContent: number,
  kind: "product" | "scrap"
): number {
  const premium = getRatePct(
    rates, metal_name, metalTotalContent, kind === "scrap" ? "scrap" : "bullion"
  );
  if (premium == null) {
    throw new Invalid(`no rate is configured for ${metal_name} ${kind}`);
  }
  return premium;
}

// A declaration's fine content. A quote prices an unmeasurable weight at zero.
export function declaredContent(
  pre_melt: number, purity: number, unit: string | null | undefined
): number {
  return fineContent(pre_melt, unit ?? "t oz", purity) ?? 0;
}

// A BULLION LINE'S CONTENT IS PER UNIT; A SCRAP LINE'S IS THE WHOLE LOT.
//
// The band is chosen on the total content of a metal across the quote, so six
// 1 oz Eagles are six ounces and must quote the 5-10 oz band. Counting
// `content` alone counted the line as one ounce however many were in it, so a
// cart quoted a lower band than the order it became actually paid.
export function bandableContent(
  kind: "product" | "scrap", content: number, quantity: number
): number {
  return kind === "scrap" ? content : content * quantity;
}

// Never below zero: a small order whose fees exceed its value does not owe the
// business money, and a negative headline is not a number to show.
export function estimatedPayout(
  total: number, shipping_charge: number, payout_charge: number
): number {
  return Math.max(0, total - shipping_charge - payout_charge);
}
