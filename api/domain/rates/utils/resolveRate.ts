import type { RateRead } from "@dorado/contracts";

const normMetal = (m: unknown): string => String(m ?? "").trim().toLowerCase();

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
