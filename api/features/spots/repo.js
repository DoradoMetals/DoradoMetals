import query from "#shared/db/query.js";

export const METALS = ["Gold", "Silver", "Platinum", "Palladium"];

export async function getAll(client) {
  const q = `
    SELECT id, type, ask_spot, bid_spot, percent_change, dollar_change
    FROM exchange.metals
    ORDER BY
      CASE type
        WHEN 'Gold' THEN 1
        WHEN 'Silver' THEN 2
        WHEN 'Platinum' THEN 3
        WHEN 'Palladium' THEN 4
        ELSE 5
      END,
      id
  `;
  const { rows } = await query(q, [], client);
  return rows;
}

// Applies a full set of quotes in one statement. A metal missing from the feed
// is passed as null and left at its previous value by the COALESCE, rather
// than having its price blanked.
export async function updateQuotes(quotesByMetal, client) {
  const rows = METALS.map((_, i) => {
    const p = i * 5;
    return `($${p + 1}::text, $${p + 2}::numeric, $${p + 3}::numeric, $${
      p + 4
    }::numeric, $${p + 5}::numeric)`;
  }).join(",\n        ");

  const q = `
    UPDATE exchange.metals AS m SET
      ask_spot = COALESCE(c.ask_spot, m.ask_spot),
      bid_spot = COALESCE(c.bid_spot, m.bid_spot),
      dollar_change = COALESCE(c.dollar_change, m.dollar_change),
      percent_change = COALESCE(c.percent_change, m.percent_change)
    FROM (
      VALUES
        ${rows}
    ) AS c(type, ask_spot, bid_spot, dollar_change, percent_change)
    WHERE m.type = c.type;
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

// Full metal rows, as the admin product editor needs them.
//
// exchange.metals holds both the metal's identity and its current spot prices,
// so this feature owns the table. In the new schema those separate -
// metals.metals is (id, name) and spots.spots holds the quotes - and this
// splits out into a metals feature at that point.
export async function getAllMetals(client) {
  const q = `SELECT * FROM exchange.metals ORDER BY type ASC, id ASC`;
  const { rows } = await query(q, [], client);
  return rows;
}
