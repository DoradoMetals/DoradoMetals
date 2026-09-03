import axios from "axios";
import * as spots from "#db/spots/repo.ts";
import * as metals from "#db/metals/repo.ts";
import { toWire } from "#domain/spots/compose.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { SpotWire as SpotRow } from "#domain/spots/compose.ts";

// One upstream quote, as this service reduces it. Not the provider's own shape:
// only these four fields are read out of it, and everything else the feed sends
// is discarded rather than stored.
export type Quote = {
  ask: number;
  bid: number;
  percentChange: number;
  dollarChange: number;
};

// THE PRICE OF METAL COMES FROM HERE, AND ONLY FROM HERE.
//
// Every money figure on an order is content * (spot.ask * ask_premium), so
// whatever supplies `spots` decides what a customer pays. That used to be the
// REQUEST BODY, in three places: get_sales_tax, createSalesOrder and
// updatePaymentIntent - and in the last of those the result becomes the amount
// Stripe is told to charge.
//
// Measured before the fix, same order, same server-fetched items, only the
// body's spots differing:
//
//   ask 3400 (honest)   ->  $3,673.53
//   ask 1               ->  $26.81
//
// An ounce of gold for $26.81. Items were already re-fetched server-side, so a
// product could not be faked - only the metal price was taken on trust.
//
// ONE SHAPE, the schema's own names (`name` / `ask` / `bid`). getPricingSpots
// used to sit beside this converting down to the legacy names for the order
// calculations; the orders wire conversion (D84) moved the calculations to the
// new names, so the shim (features/spots/legacy-shape.ts) is gone and every
// pricing caller reads this directly.
//
// FRESH ON EVERY CALL, no caching. The spot tables are updated by
// updateSpotPrices on a cron, so a read is a read of the latest quote and the
// customer is priced at what the business holds right now.
export async function getSpotPrices(executor?: Parameters<typeof spots.list>[0]): Promise<SpotRow[]> {
  return await toWire(await spots.list(executor));
}

// Pulls the upstream quote feed and writes it to spots.spots. Called by the
// scheduler on startup and on the SPOT_UPDATE_SCHEDULE cron.
//
// A quote missing its symbol or either side of the market is SKIPPED, not
// defaulted - a metal priced at zero would flow straight into an order total.
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

  // ONE UPSERT PER METAL, ONE TRANSACTION. The feed names a metal; the
  // statement keys on metal_id, so the name is resolved to an id here rather
  // than inside the INSERT, and the write never touches a second table.
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

// The admin product editor's metal list. exchange.metals carried the quote on
// the metal's own row, so the returned shape is the same composed one - identity
// plus quote - even though it now comes from two tables.
export const getAllMetals = async () => await toWire(await spots.list());
