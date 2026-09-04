// Spots: the live metal quotes, read by every pricing path and written by the
// feed cron.
import * as spots from "#db/spots/repo.ts";
import * as metals from "#db/metals/repo.ts";
import * as rules from "#domain/spots/rules.ts";
import { fetchQuotes } from "#providers/spots/feed.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Metal, SpotPrice, SpotTicker } from "@dorado/contracts";

// THE PRICE OF METAL COMES FROM HERE, AND ONLY FROM HERE. Every order figure
// is content * (spot.ask * ask_premium). Trusting the request body's spots
// instead once priced an ounce of gold at $26.81 (ask 1) instead of $3,673.53.
// FRESH ON EVERY CALL, no caching - the cron updates spots.spots, so a
// customer is priced at what the business holds right now.
export async function getSpotPrices(executor?: Executor): Promise<SpotPrice[]> {
  return await spots.list(executor);
}

// The ticker's read: the same quotes plus which way each moved.
export async function listTicker(): Promise<SpotTicker[]> {
  return rules.ticker(await spots.list());
}

export async function listMetals(): Promise<Metal[]> {
  return await metals.list();
}

// Pulls the upstream feed and writes it, on startup and on the
// SPOT_UPDATE_SCHEDULE cron. One transaction; a metal the feed names but the
// database does not have is skipped rather than invented.
export async function updateSpotPrices(): Promise<number> {
  const quotes = await fetchQuotes();
  const ids = await metals.idsByName();
  const known = new Set((await spots.list()).map((row) => row.id));

  return await withTransaction(async (tx) => {
    let written = 0;
    for (const [name, patch] of quotes) {
      const metal_id = ids.get(name);
      if (!metal_id) continue;
      if (known.has(metal_id)) await spots.update(metal_id, patch, tx);
      else await spots.create(metal_id, patch, tx);
      written += 1;
    }
    return written;
  });
}
