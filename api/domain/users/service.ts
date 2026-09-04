// The users feature's use cases: the three admin reads, and the one write -
// the credit balance, which is a money operation and reads as one.
import * as users from "#db/users/repo.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import {
  assertCreditSubject, balanceAfter, movementBetween, refuseNegativeBalance,
} from "#domain/users/rules.ts";
import type { CreditRow, UserRow } from "#db/users/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { UpdateCreditBody } from "@dorado/contracts";

export async function getUser(id: string): Promise<UserRow | undefined> {
  return await users.getOne(id);
}

export async function getAllUsers(): Promise<UserRow[]> {
  return await users.list();
}

export async function getAdminUsers(): Promise<UserRow[]> {
  return await users.getAdmins();
}

// THE ADMIN BALANCE EDIT. The body is already parsed strictly against the
// contract at transport, so what is left here is the money rule.
//
// Row-locked (FOR UPDATE) to close a lost-update race: the floor check is a
// read-then-write, and two concurrent subtractions could each pass a check only
// one should honour. The ledger row is written inside the same transaction, so
// a movement and its record commit together or neither does.
export async function adjustDoradoCredit(
  user_id: string, { op, amount }: UpdateCreditBody
): Promise<CreditRow> {
  return await withTransaction(async (tx) => {
    const current = assertCreditSubject(user_id, await users.balanceForUpdate(user_id, tx));
    const before = Number(current ?? 0);
    refuseNegativeBalance(balanceAfter(op, before, Number(amount)));

    // The locked read above already refuses an unknown user; asking again of
    // the write's own answer is the backstop for the window between them.
    const row = assertCreditSubject(
      user_id, await users.adjustCredit(user_id, op, Number(amount), tx)
    );

    // AN ADMIN EDIT IS A MOVEMENT AND MOVEMENTS ARE LEDGERED. `order_id` is
    // null because the subject is a person, not a purchase.
    const movement = movementBetween(before, Number(row.dorado_funds ?? 0));
    if (movement) {
      await transactionsService.addTransactionLog(
        { user_id, type: movement.type, order_id: null, amount: movement.amount }, tx
      );
    }
    return row;
  });
}

// The balance the quote surface prices against - the customer's own row, never
// a number in a request body. `undefined` is a subject with no user row, which
// the caller reports rather than pricing as zero.
export async function getBalance(user_id: string): Promise<number | null | undefined> {
  return await users.balance(user_id);
}

// The balance movements that accompany an order. `tx` is REQUIRED (ruling 56):
// funds that move for an order which rolls back must roll back with it, and
// every one of the three callers already held a transaction. A movement with no
// user or no amount is a no-op - `dorado_funds + NULL` is NULL against a NOT
// NULL column, which would raise 23502 after other work committed.
//
// THEY DO NOT LEDGER, AND adjustDoradoCredit DOES: every caller of these writes
// its own payments.ledger row with the order id that explains it.
export async function addFunds(
  user_id: string | null, total: number | null, tx: Executor
): Promise<CreditRow | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "add", total, tx);
}

export async function removeFunds(
  user_id: string | null, total: number | null, tx: Executor
): Promise<CreditRow | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "subtract", total, tx);
}
