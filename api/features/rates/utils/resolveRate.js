/**
 * Rate resolution for quantity-tiered pricing (server-side source of truth).
 *
 * Mirror of the frontend helper at
 * `frontend/features/rates/utils/resolveRate.ts`.
 * Keep the two in sync.
 *
 * Rates are banded per metal by [min_qty, max_qty] (max_qty null = open-ended)
 * and priced on the TOTAL quantity of a metal across the whole order.
 * `scrap_pct` / `bullion_pct` are fractions (0–1) that plug into
 * `bid_spot * premium`.
 */

const normMetal = (m) => String(m ?? '').trim().toLowerCase();

/**
 * Pick the band for a metal given the total quantity of that metal.
 * - inside a band → that band
 * - below the lowest band → the lowest band
 * - above the highest band → the highest band
 */
export function getRateBand(rates, metal, totalQty) {
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
 * `material` is 'scrap' | 'bullion'.
 */
export function getRatePct(rates, metal, totalQty, material) {
  if (!rates || rates.length === 0) return undefined;
  const band = getRateBand(rates, metal, totalQty);
  if (!band) return undefined;
  const pct = material === 'scrap' ? band.scrap_pct : band.bullion_pct;
  return pct == null ? undefined : Number(pct);
}

/** Sum content per metal (lowercased metal key → total content). */
export function sumContentByMetal(items, getMetal, getContent) {
  const totals = {};
  for (const it of items ?? []) {
    const metal = getMetal(it);
    if (!metal) continue;
    const key = normMetal(metal);
    totals[key] = (totals[key] ?? 0) + (Number(getContent(it)) || 0);
  }
  return totals;
}
