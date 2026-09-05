import * as users from "#db/users/repo.ts";
import * as transactionsService from "#payments/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import {
  assertCreditSubject, balanceAfter, movementBetween, refuseNegativeBalance,
} from "#identity/users/rules.ts";
import type { AdminUser, UserCredit } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import type { UpdateCreditBody } from "@dorado/contracts";

export async function getUser(id: string): Promise<AdminUser | undefined> {
  return await users.getOne(id);
}

export async function getAllUsers(): Promise<AdminUser[]> {
  return await users.list();
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return await users.getAdmins();
}

export async function adjustDoradoCredit(
  user_id: string, { op, amount }: UpdateCreditBody
): Promise<UserCredit> {
  return await withTransaction(async (tx) => {
    const current = assertCreditSubject(user_id, await users.balanceForUpdate(user_id, tx));
    const before = Number(current ?? 0);
    refuseNegativeBalance(balanceAfter(op, before, Number(amount)));

    const row = assertCreditSubject(
      user_id, await users.adjustCredit(user_id, op, Number(amount), tx)
    );

    const movement = movementBetween(before, Number(row.dorado_funds ?? 0));
    if (movement) {
      await transactionsService.addTransactionLog(
        { user_id, type: movement.type, order_id: null, amount: movement.amount }, tx
      );
    }
    return row;
  });
}

export async function getBalance(user_id: string): Promise<number | null | undefined> {
  return await users.balance(user_id);
}

export async function addFunds(
  user_id: string | null, total: number | null, tx: Executor
): Promise<UserCredit | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "add", total, tx);
}

export async function removeFunds(
  user_id: string | null, total: number | null, tx: Executor
): Promise<UserCredit | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "subtract", total, tx);
}
