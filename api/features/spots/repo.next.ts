// Spot prices read from the split schemas: metals.metals holds the metal's
// identity, spots.spots holds its current quote.
//
// The wire shape is preserved exactly. exchange.metals returns `type` for the
// metal name and ask_spot/bid_spot for the quote; here those are metals.name
// and spots.ask/bid, aliased back so callers cannot tell the difference. The id
// returned is still the metal's, not the quote row's, because that is what
// exchange returned and what the frontend keys on.
import query from "#shared/db/query.js";
import type { spots, metals } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// A spot quote is two rows in the new layout: metals.metals holds the metal's
// identity and spots.spots holds its current quote. The read aliases them back
// into exchange's flat shape - `name`/`ask`/`bid` - so callers cannot tell.
export type SpotRow = Pick<metals.MetalsRow, "id" | "name"> &
  Pick<spots.SpotsRow, "ask" | "bid" | "percent_change" | "dollar_change">;

// A full set of quotes from the upstream feed, keyed by metal name. A metal
// missing from the feed is passed as null and left at its previous value by
// the COALESCE, rather than having its price blanked - that behaviour is
// deliberate and tested.
export interface Quote {
  ask: number | null;
  bid: number | null;
  percentChange?: number | null;
  dollarChange?: number | null;
}


export const METALS = ["Gold", "Silver", "Platinum", "Palladium"];

const ORDER = `
    ORDER BY
      CASE m.name
        WHEN 'Gold' THEN 1
        WHEN 'Silver' THEN 2
        WHEN 'Platinum' THEN 3
        WHEN 'Palladium' THEN 4
        ELSE 5
      END,
      m.id
`;

export async function getAll(client?: Executor): Promise<SpotRow[]> {
  const q = `
    SELECT m.id, m.name, s.ask, s.bid,
           s.percent_change, s.dollar_change
    FROM metals.metals m
    JOIN spots.spots s ON s.metal_id = m.id
    ${ORDER}
  `;
  const { rows } = await query<SpotRow>(q, [], client);
  return rows;
}

// One live quote per metal, so this is an upsert keyed on metal_id rather than
// an update. A metal missing from the feed is passed as null and left at its
// previous value by the COALESCE, rather than having its price blanked.
export async function updateQuotes(
  quotesByMetal: Record<string, Quote | undefined>,
  client?: Executor
): Promise<unknown> {
  const rows = METALS.map((_, i) => {
    const p = i * 5;
    return `($${p + 1}::text, $${p + 2}::numeric, $${p + 3}::numeric, $${
      p + 4
    }::numeric, $${p + 5}::numeric)`;
  }).join(",\n        ");

  const q = `
    INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
    SELECT m.id, c.ask, c.bid, c.dollar_change, c.percent_change
    FROM (
      VALUES
        ${rows}
    ) AS c(name, ask, bid, dollar_change, percent_change)
    JOIN metals.metals m ON m.name = c.name
    ON CONFLICT (metal_id) DO UPDATE SET
      ask            = COALESCE(EXCLUDED.ask, spots.spots.ask),
      bid            = COALESCE(EXCLUDED.bid, spots.spots.bid),
      dollar_change  = COALESCE(EXCLUDED.dollar_change, spots.spots.dollar_change),
      percent_change = COALESCE(EXCLUDED.percent_change, spots.spots.percent_change),
      updated_at     = now();
  `;

  const params = METALS.flatMap((metal) => {
    const quote = quotesByMetal[metal];
    return [
      metal,
      quote?.ask ?? null,
      quote?.bid ?? null,
      quote?.dollarChange ?? null,
      quote?.percentChange ?? null,
    ];
  });

  return query(q, params, client);
}

// The admin product editor's metal list. exchange.metals carried the quote
// columns on the same row; here identity is all that is needed, so the quote is
// joined in to keep the returned shape identical.
export async function getAllMetals(client?: Executor): Promise<SpotRow[]> {
  const q = `
    SELECT m.id, m.name, s.ask, s.bid,
           s.percent_change, s.dollar_change
    FROM metals.metals m
    LEFT JOIN spots.spots s ON s.metal_id = m.id
    ORDER BY m.name ASC, m.id ASC
  `;
  const { rows } = await query<SpotRow>(q, [], client);
  return rows;
}
