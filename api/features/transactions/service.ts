// The customer credit ledger, straight through to the switch.
//
// RETURNS ONE ENTRY, NOT A HISTORY, and the type says so because the code does:
// both implementations end in `rows[0]`. That is a real defect - a customer
// with five movements would be shown their oldest - but nothing calls this
// route, and correcting it turns an object into an array, which is a wire-shape
// change during a schema migration. Recorded in FOLLOWUPS.md and the decision
// log as D21 rather than changed here.
import * as transactionRepo from "#features/transactions/repo.js";
import type { LedgerRow } from "#features/transactions/repo.next.ts";

export async function getTransactionHistory(
  user_id: string
): Promise<LedgerRow | undefined> {
  return transactionRepo.getTransactionHistory(user_id);
}
