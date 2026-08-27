// A quote and the metal it is for.
//
// spots.spots has metal_id; every caller reads `name`. Composed from one read
// of metals.metals - four rows - rather than the join the old query did.
import * as metals from "#features/metals/repo.ts";
import type { SpotRow } from "#features/spots/repo.ts";

export type SpotWire = {
  id: string; name: string;
  ask: number | null; bid: number | null;
  percent_change: number | null; dollar_change: number | null;
};

// THE DISPLAY ORDER IS GOLD, SILVER, PLATINUM, PALLADIUM - not alphabetical.
// It was a CASE inside the old ORDER BY, on the joined name, so it moves here.
const RANK: Record<string, number> = { Gold: 1, Silver: 2, Platinum: 3, Palladium: 4 };
const rank = (n: string) => RANK[n] ?? 5;

// `id` is the METAL's id, not the quote's - that is what the old projection
// selected (m.id) and what every caller keys on.
export async function toWire(rows: SpotRow[]): Promise<SpotWire[]> {
  const names = await metals.namesById();
  return rows
    .flatMap((s) => {
      const name = names.get(s.metal_id);
      // The old query INNER JOINed metals, so a quote for an unknown metal
      // never reached a caller. Preserved.
      return name === undefined ? [] : [{
        id: s.metal_id, name,
        ask: s.ask, bid: s.bid,
        percent_change: s.percent_change, dollar_change: s.dollar_change,
      }];
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.id.localeCompare(b.id));
}
