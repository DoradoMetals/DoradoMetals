// The rate feature's pure rules and its refusals (ruling 65). No database, no
// HTTP: every function here takes rows already loaded.
import { NotFound } from "#shared/errors.ts";
import type { AdminRate, RateBand, RateRead, RateTier } from "@dorado/contracts";

export function assertRate<T>(row: T | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no rate ${id}`);
}

export function assertChanged(changed: boolean, id: string): void {
  if (!changed) throw new NotFound(`no rate ${id}`);
}

// A band's identity ACROSS metals, so the same volume band lines up
// column-wise on every card of the rates page.
const keyOf = (min: number, max: number | null, unit: string) =>
  `${min}-${max ?? "inf"}-${unit}`;

// "oz", not "troy_oz": the column stores the unit the business bands by, and
// this is the word a customer reads.
const prettyUnit = (unit: string): string => {
  const v = unit.toLowerCase().replace(/_/g, " ");
  return ["troy oz", "troy ounce", "troy ounces", "oz", "ounce", "ounces"].includes(v) ? "oz" : v;
};

const labelOf = (min: number, max: number | null, unit: string): string => {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  return max === null ? `${n.format(min)}+ ${unit}` : `${n.format(min)}–${n.format(max)} ${unit}`;
};

// The highest percentage a metal pays, either material - the "up to" number.
const topOf = (bands: RateBand[]): number | null => {
  const pcts = bands.flatMap((b) => [b.scrap_pct, b.bullion_pct]);
  return pcts.length === 0 ? null : Math.max(...pcts);
};

// THE RATES PAGE, COMPUTED. Group by metal, dedupe bands that share
// (min, max, unit), label each, order by volume. Rows arrive ordered by metal
// then min_qty (sql/get_all.sql), so insertion order is already the answer.
export function tiers(rows: RateRead[]): RateTier[] {
  const byMetal = new Map<string, RateTier>();
  for (const row of rows) {
    const unit = prettyUnit(row.unit);
    const tier = byMetal.get(row.metal) ?? { metal: row.metal, unit, bands: [], top_pct: null };
    const key = keyOf(row.min_qty, row.max_qty, unit);
    const seen = tier.bands.find((b) => b.key === key);
    if (seen) {
      seen.scrap_pct = row.scrap_pct;
      seen.bullion_pct = row.bullion_pct;
    } else {
      tier.bands.push({
        key,
        label: labelOf(row.min_qty, row.max_qty, unit),
        min_qty: row.min_qty,
        max_qty: row.max_qty,
        scrap_pct: row.scrap_pct,
        bullion_pct: row.bullion_pct,
      });
    }
    byMetal.set(row.metal, tier);
  }
  for (const tier of byMetal.values()) tier.top_pct = topOf(tier.bands);
  return [...byMetal.values()];
}

