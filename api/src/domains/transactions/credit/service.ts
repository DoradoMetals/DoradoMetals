import * as users from '#db/users/repo.ts'
import * as ledger from '#transactions/ledger/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import {
  assertCreditSubject,
  assertReservationOwner,
  balanceAfter,
  movementBetween,
  refuseNegativeBalance,
} from '#transactions/credit/rules.ts'
import type { UpdateCreditBody, UserCredit } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function adjustDoradoCredit(
  user_id: string,
  { op, amount }: UpdateCreditBody
): Promise<UserCredit> {
  return await withTransaction(async (tx) => {
    const current = assertCreditSubject(user_id, await users.balanceForUpdate(user_id, tx))
    const before = Number(current ?? 0)
    refuseNegativeBalance(balanceAfter(op, before, Number(amount)))

    const row = assertCreditSubject(
      user_id,
      await users.adjustCredit(user_id, op, Number(amount), tx)
    )

    const movement = movementBetween(before, Number(row.dorado_funds ?? 0))
    if (movement) {
      await ledger.addTransactionLog(
        { user_id, type: movement.type, order_id: null, amount: movement.amount },
        tx
      )
    }
    return row
  })
}

export async function getBalance(user_id: string): Promise<number | null | undefined> {
  return await users.balance(user_id)
}

export async function addFunds(
  user_id: string | null,
  total: number | null,
  tx: Executor
): Promise<UserCredit | undefined> {
  if (!user_id || total === null) return undefined
  return await users.adjustCredit(user_id, 'add', total, tx)
}

export async function removeFunds(
  user_id: string | null,
  total: number | null,
  tx: Executor
): Promise<UserCredit | undefined> {
  if (!user_id || total === null) return undefined
  const before = Number(
    assertCreditSubject(user_id, await users.balanceForUpdate(user_id, tx)) ?? 0
  )
  refuseNegativeBalance(balanceAfter('subtract', before, Number(total)))
  return await users.adjustCredit(user_id, 'subtract', total, tx)
}

export async function reserve(
  user_id: string,
  amount: number,
  order_id: string,
  tx: Executor
): Promise<void> {
  await removeFunds(user_id, amount, tx)
  await ledger.addTransactionLog({ user_id, type: 'Reserve', order_id, amount }, tx)
}

export async function releaseReservation(order_id: string, tx: Executor): Promise<number> {
  const released = await ledger.resolveReservation(order_id, 'Released', tx)
  if (!released) return 0
  const amount = Number(released.amount ?? 0)
  const owner = assertReservationOwner(released.user_id, order_id)
  assertCreditSubject(owner, await users.adjustCredit(owner, 'add', amount, tx))
  return amount
}

export async function settleReservation(order_id: string, tx: Executor): Promise<boolean> {
  return (await ledger.resolveReservation(order_id, 'Debit', tx)) !== undefined
}
