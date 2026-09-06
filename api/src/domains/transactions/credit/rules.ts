import { Invalid, NotFound } from '#shared/errors.ts'
import type { CreditOp } from '@dorado/contracts'

export function balanceAfter(op: CreditOp, current: number, amount: number): number {
  const raw = op === 'add' ? current + amount : op === 'subtract' ? current - amount : amount
  return Number(raw.toFixed(6))
}

export function refuseNegativeBalance(next: number): void {
  if (next < 0) {
    throw new Invalid(
      `that would leave a balance of ${next.toFixed(2)}; a credit balance cannot go below zero`
    )
  }
}

export function movementBetween(
  before: number,
  after: number
): { type: 'Credit' | 'Debit'; amount: number } | null {
  const delta = Number((after - before).toFixed(6))
  if (delta === 0) return null
  return delta > 0 ? { type: 'Credit', amount: delta } : { type: 'Debit', amount: -delta }
}

export function assertReservationOwner(
  user_id: string | null | undefined,
  order_id: string
): string {
  if (!user_id) {
    throw new Invalid(
      `the credit reserved against order ${order_id} belongs to nobody, so it ` +
        `cannot be returned`
    )
  }
  return user_id
}

export function assertCreditSubject<T>(user_id: string, row: T | undefined): T {
  if (row === undefined) {
    throw new NotFound(`no user ${user_id} - the credit adjustment was not applied to anybody`)
  }
  return row
}
