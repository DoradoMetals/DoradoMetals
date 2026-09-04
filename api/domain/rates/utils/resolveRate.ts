/**
 * RateRead resolution for quantity-tiered pricing (server-side source of truth).
 * Mirror of the frontend helper at `frontend/features/rates/utils/resolveRate.ts` - keep the two in sync.
 *
 * Rates are banded per metal by [min_qty, max_qty] (max_qty null = open-ended)
 * and priced on the TOTAL quantity of a metal across the whole order.
 * `scrap_pct` / `bullion_pct` are fractions (0–1) that plug into
 * `bid_spot * premium`.
 */
import type { RateRead } from "@dorado/contracts";

const normMetal = (m: unknown): string => String(m ?? "").trim().toLowerCase();

/**
 * Pick the band for a metal given the total quantity of that metal.
 * - inside a band → that band
 * - below the lowest band → the lowest band
 * - above the highest band → the highest band
 */
export function getRateBand(
  rates: RateRead[] | null | undefined,
  metal: unknown,
  totalQty: number
): RateRead | null {
  const bands = (rates ?? [])
    .filter((r) => normMetal(r.metal) === normMetal(metal))
    .sort((a, b) => a.min_qty - b.min_qty);

  if (bands.length === 0) return null;

  const hit = bands.find(
    (r) => totalQty >= r.min_qty && (r.max_qty == null || totalQty <= r.max_qty)
  );
  if (hit) return hit;

  if (totalQty < bands[0].min_qty) return bands[0];
  return bands[bands.length - 1];
}

/**
 * Resolve the premium fraction (0–1) for a metal at a given order-total qty.
 * Returns undefined when no band exists (caller decides the fallback).
 */
export function getRatePct(
  rates: RateRead[] | null | undefined,
  metal: unknown,
  totalQty: number,
  material: "scrap" | "bullion"
): number | undefined {
  if (!rates || rates.length === 0) return undefined;
  const band = getRateBand(rates, metal, totalQty);
  if (!band) return undefined;
  const pct = material === "scrap" ? band.scrap_pct : band.bullion_pct;
  return pct == null ? undefined : Number(pct);
}

/**
 * Sum content per metal (lowercased metal key → total content).
 *
 * Generic in the item, because callers pass order items, cart lines and scrap
 * rows and the only thing this needs is the two accessors. Typing it as a
 * concrete row would force a cast at every call site, which is the same as
 * `any` with extra steps.
 */
export function sumContentByMetal<T>(
  items: T[] | null | undefined,
  getMetal: (item: T) => unknown,
  getContent: (item: T) => unknown
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const it of items ?? []) {
    const metal = getMetal(it);
    if (!metal) continue;
    const key = normMetal(metal);
    totals[key] = (totals[key] ?? 0) + (Number(getContent(it)) || 0);
  }
  return totals;
}
