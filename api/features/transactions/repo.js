// Selects which schema the credit ledger reads and writes.
//
//   TRANSACTIONS_SOURCE=exchange  (default) exchange.account_transactions
//   TRANSACTIONS_SOURCE=dual                writes both, reads exchange
//
// There is deliberately no `next`. This feature writes, and writing only to the
// new schema is the one-way door: exchange stops receiving ledger entries and
// falling back loses every movement in between. repo.next.ts exists all the
// same - the diff compares it against exchange, which is what proves the
// reshaped columns project back correctly before anything is promoted.
//
// This ledger had no target at all until August 2026 - January never built one,
// and no feature declared exchange.account_transactions, so every audit walked
// straight past seventeen production rows totalling $66,999.32. See
// migration 060.
import * as exchange from "#features/transactions/repo.exchange.js";
import * as dual from "#features/transactions/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.TRANSACTIONS_SOURCE ?? "")
  ? process.env.TRANSACTIONS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const addFunds = impl.addFunds;
export const removeFunds = impl.removeFunds;
export const getTransactionHistory = impl.getTransactionHistory;
export const addTransactionLog = impl.addTransactionLog;
