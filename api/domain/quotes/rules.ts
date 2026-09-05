import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";

export function bidPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  metal_name: string | null | undefined,
  spots: PricingSpot[]
): number {
  const spot = spots.find((s) => s.name === metal_name);
  return (content ?? 0) * ((spot?.bid ?? 0) * (premium ?? 0));
}

export function requireMetalName(
  name: string | null | undefined, item_id: string
): string {
  if (!name) throw new Invalid(`checkout item ${item_id} has no resolvable metal`);
  return name;
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
