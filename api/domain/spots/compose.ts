// A quote and the metal it is for - composed from one read of metals.metals (four rows) rather than a join.
import * as metals from "#db/metals/repo.ts";
import type { SpotRow } from "#db/spots/repo.ts";

export type SpotWire = {
  id: string; name: string;
  ask: number | null; bid: number | null;
  percent_change: number | null; dollar_change: number | null;
};

// Display order is Gold, Silver, Platinum, Palladium - not alphabetical.
const RANK: Record<string, number> = { Gold: 1, Silver: 2, Platinum: 3, Palladium: 4 };
const rank = (n: string) => RANK[n] ?? 5;

// `id` is the METAL's id, not the quote's - what every caller keys on.
export async function toWire(rows: SpotRow[]): Promise<SpotWire[]> {
  const names = await metals.namesById();
  return rows
    .flatMap((s) => {
      const name = names.get(s.metal_id);
      // A quote for an unknown metal never reaches a caller.
      return name === undefined ? [] : [{
        id: s.metal_id, name,
        ask: s.ask, bid: s.bid,
        percent_change: s.percent_change, dollar_change: s.dollar_change,
      }];
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.id.localeCompare(b.id));
}
