import axios from "axios";
import * as spotRepo from "#features/spots/repo.js";
import { toLegacy as spotsToLegacy } from "#features/spots/wire.ts";
import type { SpotPriceWire } from "@dorado/contracts";
import type { SpotRow } from "#features/spots/repo.next.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// One upstream quote, as this service reduces it. Not the provider's own shape:
// only these four fields are read out of it, and everything else the feed sends
// is discarded rather than stored.
export type Quote = {
  ask: number;
  bid: number;
  percentChange: number;
  dollarChange: number;
};

export async function getSpotPrices(): Promise<SpotRow[]> {
  return spotRepo.getAll();
}

// THE PRICE OF METAL COMES FROM HERE, AND ONLY FROM HERE.
//
// Every money figure on an order is content * (spot.ask_spot * ask_premium),
// so whatever supplies `spots` decides what a customer pays. That used to be
// the REQUEST BODY, in three places: get_sales_tax, createSalesOrder and
// updatePaymentIntent - and in the last of those the result becomes the amount
// Stripe is told to charge.
//
// Measured before the fix, same order, same server-fetched items, only the
// body's spots differing:
//
//   ask_spot 3400 (honest)   ->  $3,673.53
//   ask_spot 1               ->  $26.81
//
// An ounce of gold for $26.81. Items were already re-fetched server-side, so a
// product could not be faked - only the metal price was taken on trust.
//
// SHAPED FOR THE CALCULATIONS, DELIBERATELY, and the return type says so:
// SpotPriceWire is the LEGACY shape (`type` / `ask_spot` / `bid_spot`), which
// is what calculateItemAsk reads. The repo returns the new one (`name` / `ask`
// / `bid`). toLegacy converts down, and it does so unconditionally rather than
// following SPOTS_WIRE - that is the difference between toLegacy and toWire,
// and it is why this keeps working when the switch flips. When the calculations
// move to the new names, this is the one place to change.
//
// FRESH ON EVERY CALL, no caching. exchange.metals is updated by
// updateSpotPrices on a cron, so a read is a read of the latest quote and the
// customer is priced at what the business holds right now.
export async function getPricingSpots(client?: Executor): Promise<SpotPriceWire[]> {
  return spotsToLegacy(await spotRepo.getAll(client)) as SpotPriceWire[];
}

// Pulls the upstream quote feed and writes it to exchange.metals. Called by the
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

  await spotRepo.updateQuotes(quotes);
  return quotes;
}

export const getAllMetals = () => spotRepo.getAllMetals();
