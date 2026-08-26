// Dual-write phase of the spots schema migration.
//
// updateQuotes runs on the cron every few minutes and is the only write, so
// both schemas stay current together. Reads come from the split schemas so they
// are exercised by real traffic while exchange.metals remains authoritative.
//
// Spot prices feed every price the business quotes - calculateItemPrice is
// content * (bid_spot * premium) - so a divergence here misprices every order
// placed while it lasts. The two writes share a transaction for that reason.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/spots/repo.exchange.js";
import * as next from "#features/spots/repo.next.ts";

export const METALS = exchange.METALS;
export const getAll = next.getAll;
export const getAllMetals = next.getAllMetals;

export async function updateQuotes(quotesByMetal, client) {
  const run = async (c) => {
    await exchange.updateQuotes(quotesByMetal, c);
    await next.updateQuotes(quotesByMetal, c);
  };
  return client ? run(client) : withTransaction(run);
}
