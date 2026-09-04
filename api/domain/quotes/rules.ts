// The quote surface's pure decisions: what a line is worth on each side, and
// the refusals that stop a quote the placed order would not honour.
//
// NOTHING HERE READS A DATABASE OR A REQUEST. Every function takes rows and
// answers a number or throws.
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
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

// ----------------------------------------------------------------- refusals
//
// RULING 65: a use case states the happy path and calls one of these. Every
// message here is deliberately vague about WHICH id was refused - an unknown
// id and a hidden one answer the same, so the message cannot be used to
// enumerate the catalogue.

// The same gate checkout applies to a cart, applied to a quote: an ASK quote
// may only name a product live on the buy side. A BID quote has no gate
// (ruling 49) - the caller checks only that the id names a product at all.
export function assertProductsAreLive(refused: string[]): void {
  if (refused.length > 0) {
    throw new Invalid(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

// The liveness gate proved the id exists; a row can still drop out of the
// priced read if its metal or mint no longer resolves - refused rather than
// understated.
export function assertProduct<T>(row: T | null | undefined): asserts row is T {
  if (!row) throw new Invalid("That product is not available");
}

// THE BALANCE IS THE SUBJECT'S OWN ROW. `undefined` is no row at all, which
// for a signed-in session means the session outlived its user - not a missing
// resource the caller named.
export function assertBalance(
  balance: number | string | null | undefined
): asserts balance is number | string | null {
  if (balance === undefined) throw new Forbidden("no user row for this session");
}

// An address the caller named and we cannot find. The quote's address is
// OPTIONAL - absent means taxed in no state - so this fires only when one WAS
// named, and a silent fall-through to "no state" would undercharge tax.
export function assertAddress<T>(
  row: T | null | undefined, address_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no address ${address_id}`);
}

// A payment method id that is not a PAYOUT method. The set is
// payouts/constants.ts's, and it is named in the message because it is a
// closed list of four the caller can correct against.
export function assertPayoutFee(
  fee: number | null, methods: string[]
): asserts fee is number {
  if (fee === null) {
    throw new Invalid(
      `that is not a payout method - expected one of ${methods.join(", ")}`
    );
  }
}

// requireOwnOrder answers 403 for a customer naming an order that is not
// theirs or does not exist, so only an admin reaches this - which is why the
// message can say plainly that there is no such order.
export function assertOrder<T>(order: T | null | undefined): asserts order is T {
  if (!order) throw new NotFound("no such purchase order");
}
