import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { ORDER_STATE } from '#db/orders/repo.ts'
import type { AdminUser, CreditOp, UserCreateFacts, UserCredit, UserPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

const CUSTOMER_STATE = expression(sql('customer_state'))
const LAST_CONTACT = expression(sql('last_contact'))

const read = (name: string): string =>
  sql(name)
    .replace('/*__order_state__*/', ORDER_STATE)
    .replace('/*__customer_state__*/', CUSTOMER_STATE)
    .replace('/*__last_contact__*/', LAST_CONTACT)

const GET_ONE_SQL = read('get_one')
const GET_ALL_SQL = read('get_all')
const GET_ADMINS_SQL = read('get_admins')

const BAN_REASON = '"banReason"'
const BAN_EXPIRES = '"banExpires"'
const PATCHABLE = ['assigned_to_id', 'banned', BAN_REASON, BAN_EXPIRES] as const

export async function getOne(id: string, executor?: Executor): Promise<AdminUser | undefined> {
  const { rows } = await query<AdminUser>(GET_ONE_SQL, [id], executor)
  return rows[0]
}

export async function list(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(GET_ALL_SQL, [], executor)
  return rows
}

export async function getAdmins(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(GET_ADMINS_SQL, [], executor)
  return rows
}

export async function create(facts: UserCreateFacts, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql('create'),
    [facts.email, facts.name, facts.phone_number],
    executor
  )
  return rows[0]!.id
}

export async function updateFacts(
  id: string,
  patch: UserPatch,
  executor?: Executor
): Promise<boolean> {
  const mapped: Record<string, unknown> = {}
  if ('assigned_to_id' in patch) mapped.assigned_to_id = patch.assigned_to_id
  if ('banned' in patch) mapped.banned = patch.banned
  if ('ban_reason' in patch) mapped[BAN_REASON] = patch.ban_reason
  if ('ban_expires' in patch) mapped[BAN_EXPIRES] = patch.ban_expires

  const built = buildUpdate({
    table: 'auth.users',
    allowed: PATCHABLE,
    patch: mapped,
    where: { id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function adjustCredit(
  user_id: string,
  mode: CreditOp,
  amount: number,
  executor?: Executor
): Promise<UserCredit | undefined> {
  const { rows } = await query<UserCredit>(sql('adjust_credit'), [amount, mode, user_id], executor)
  return rows[0]
}

export async function balanceForUpdate(
  user_id: string,
  executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql('balance_for_update'),
    [user_id],
    executor
  )
  return rows.length === 0 ? undefined : rows[0].dorado_funds
}

export async function balance(
  user_id: string,
  executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(sql('balance'), [user_id], executor)
  return rows.length === 0 ? undefined : rows[0].dorado_funds
}

export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query(sql('exists'), [id], executor)
  return rows.length > 0
}
