import axios from "axios";
import * as spots from "#db/spots/repo.ts";
import * as metals from "#db/metals/repo.ts";
import { toWire } from "#domain/spots/compose.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { SpotWire as SpotRow } from "#domain/spots/compose.ts";

// One upstream quote, as this service reduces it - only these four fields are read; everything else the feed sends is discarded.
export type Quote = {
  ask: number;
  bid: number;
  percentChange: number;
  dollarChange: number;
};

// THE PRICE OF METAL COMES FROM HERE, AND ONLY FROM HERE. Every order figure is content * (spot.ask * ask_premium). Trusting the request body's spots instead once priced an ounce of gold at $26.81 (ask 1) instead of $3,673.53 (ask 3400, honest) on the same order.
// FRESH ON EVERY CALL, no caching - spots.spots is updated by a cron, so the customer is priced at what the business holds right now.
export async function getSpotPrices(executor?: Parameters<typeof spots.list>[0]): Promise<SpotRow[]> {
  return await toWire(await spots.list(executor));
}

// Pulls the upstream quote feed and writes it to spots.spots, on startup and on the SPOT_UPDATE_SCHEDULE cron.
// A quote missing its symbol or either side of the market is SKIPPED, not defaulted - a metal priced at zero would flow straight into an order total.
export async function updateSpotPrices(): Promise<Record<string, Quote>> {
  const response = await axios.get(process.env.SPOT_API_URL as string, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DoradoMetalsExchange/1.0",
    },
  });

  const quotes: Record<string, Quote> = {};

  for (const metal of response.data) {
    const name = metal.data?.symbol?.trim();
    const bid = metal.data?.bid;
    const ask = metal.data?.ask;

    if (!name || bid == null || ask == null) continue;

    quotes[name] = {
      ask: Number(ask.toFixed(2)),
      bid: Number(bid.toFixed(2)),
      percentChange: Number(metal.data?.oneDayPercentChange?.toFixed(2) ?? 0),
      dollarChange: Number(metal.data?.oneDayChange?.toFixed(2) ?? 0),
    };
  }

  // One upsert per metal, one transaction - the name is resolved to an id here rather than inside the INSERT, so the write never touches a second table.
  const ids = new Map(Array.from(await metals.namesById(), ([id, name]) => [name, id]));
  await withTransaction(async (c) => {
    for (const [name, quote] of Object.entries(quotes)) {
      const id = ids.get(name);
      // A metal the feed names but the database does not have is skipped
      // rather than invented.
      if (id) await spots.upsert(id, quote, c);
    }
  });
  return quotes;
}

// The admin product editor's metal list - identity plus quote, composed from two tables.
export const getAllMetals = async () => await toWire(await spots.list());
