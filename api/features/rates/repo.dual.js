// Dual-write phase of the rates schema migration.
//
// Writes go to exchange and are mirrored into rates.rates, both inside one
// transaction. Reads come from the new schema so it is exercised by real
// traffic while exchange stays a complete replica.
//
// Rates decide what a customer is paid - getRatePct feeds straight into
// bid_spot * premium - so a divergence here is a pricing error, not a display
// one. The two writes share a transaction for that reason.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/rates/repo.exchange.js";
import * as next from "#features/rates/repo.next.ts";

export const getRate = next.getRate;
export const getAllRates = next.getAllRates;
export const getAdminRates = next.getAdminRates;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export async function createRate(rate, executor) {
  return both(executor, async (c) => {
    const written = await exchange.createRate(rate, c);
    await next.mirrorRate(written.id, c);
    return written;
  });
}

export async function updateRate(rate, user_name, executor) {
  return both(executor, async (c) => {
    const written = await exchange.updateRate(rate, user_name, c);
    await next.mirrorRate(written.id, c);
    return written;
  });
}

export async function deleteRate(id, executor) {
  return both(executor, async (c) => {
    const result = await exchange.deleteRate(id, c);
    await next.deleteRate(id, c);
    return result;
  });
}
