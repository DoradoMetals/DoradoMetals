// Dual-write phase of the sales-tax schema migration.
//
// Only updateStateSalesTax writes; the other two are reads and come from the
// new schema so it is exercised by real traffic. The write goes to both, in one
// transaction, so exchange stays a complete replica and falling back loses
// nothing.
//
// This one matters more than it looks: updateStateSalesTax accumulates the tax
// owed per state. If the two schemas ever drift, the number the business
// remits is wrong in one of them, and it is an increment rather than an
// absolute - so a single missed write is permanent, not self-correcting.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/sales-tax/repo.exchange.js";
import * as next from "#features/sales-tax/repo.next.ts";

export const getSalesTax = next.getSalesTax;
export const isNexus = next.isNexus;

export async function updateStateSalesTax(amount, state, executor) {
  const run = async (c) => {
    await exchange.updateStateSalesTax(amount, state, c);
    await next.updateStateSalesTax(amount, state, c);
  };
  return executor ? run(executor) : withTransaction(run);
}
