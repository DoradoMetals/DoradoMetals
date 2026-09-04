import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import { getRatePct } from "#domain/rates/utils/resolveRate.ts";
import { fineContent } from "#domain/pricing/content.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { RateRead, SpotPrice } from "@dorado/contracts";

export function bidPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  metal_name: string | null | undefined,
  spots: PricingSpot[]
): number {
  const spot = spots.find((s) => s.name === metal_name);
  return (content ?? 0) * ((spot?.bid ?? 0) * (premium ?? 0));
}

export function requireSpot(spots: SpotPrice[], metal_id: string): SpotPrice {
  const spot = spots.find((s) => s.id === metal_id);
  if (!spot) throw new Invalid("that metal has no spot price today");
  return spot;
}

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

export function declaredContent(
  pre_melt: number, purity: number, unit: string | null | undefined
): number {
  return fineContent(pre_melt, unit ?? "t oz", purity) ?? 0;
}

export function bandableContent(
  kind: "product" | "scrap", content: number, quantity: number
): number {
  return kind === "scrap" ? content : content * quantity;
}

export function estimatedPayout(
  total: number, shipping_charge: number, payout_charge: number
): number {
  return Math.max(0, total - shipping_charge - payout_charge);
}

export function assertProductsAreLive(refused: string[]): void {
  if (refused.length > 0) {
    throw new Invalid(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

export function assertProduct<T>(row: T | null | undefined): asserts row is T {
  if (!row) throw new Invalid("That product is not available");
}

export function assertBalance(
  balance: number | string | null | undefined
): asserts balance is number | string | null {
  if (balance === undefined) throw new Forbidden("no user row for this session");
}

export function assertAddress<T>(
  row: T | null | undefined, address_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no address ${address_id}`);
}

export function assertPayoutFee(
  fee: number | null, methods: string[]
): asserts fee is number {
  if (fee === null) {
    throw new Invalid(
      `that is not a payout method - expected one of ${methods.join(", ")}`
    );
  }
}

export function assertOrder<T>(order: T | null | undefined): asserts order is T {
  if (!order) throw new NotFound("no such purchase order");
}
