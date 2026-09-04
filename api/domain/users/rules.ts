// The pure decisions behind a credit adjustment: what the balance becomes, and
// what the ledger calls the movement.
import { Invalid } from "#shared/errors.ts";
import type { UpdateCreditBody } from "@dorado/contracts";

export type CreditOp = UpdateCreditBody["op"];

// Mirrors the repo's SQL CASE so the floor below can be checked before the
// write. Rounded to 6 places: NUMERIC is exact and JS floats are not, so a
// balance minus itself lands on -1e-16 and wrongly refuses a full withdrawal.
export function balanceAfter(op: CreditOp, current: number, amount: number): number {
  const raw = op === "add" ? current + amount : op === "subtract" ? current - amount : amount;
  return Number(raw.toFixed(6));
}

// THE FLOOR WAS ONLY EVER CHECKED IN THE BROWSER. The column is NOT NULL with
// no CHECK, so the database would have taken a negative balance.
export function refuseNegativeBalance(next: number): void {
  if (next < 0) {
    throw new Invalid(
      `that would leave a balance of ${next.toFixed(2)}; a credit balance cannot go below zero`
    );
  }
}

export type CreditMovement = { type: "Credit" | "Debit"; amount: number };

// WHAT THE LEDGER RECORDS, derived from the two balances rather than the
// request: `edit` does not name its own direction, and payments.ledger.amount
// carries a CHECK (amount >= 0), so a signed delta could not be stored.
export function movementBetween(before: number, after: number): CreditMovement | null {
  const delta = Number((after - before).toFixed(6));
  if (delta === 0) return null;
  return delta > 0 ? { type: "Credit", amount: delta } : { type: "Debit", amount: -delta };
}
