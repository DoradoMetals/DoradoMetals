import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { AccountProfile, User } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(id: string, executor?: Executor): Promise<User | undefined> {
  const { rows } = await query<User>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getProfile(
  id: string,
  executor?: Executor
): Promise<AccountProfile | undefined> {
  const { rows } = await query<AccountProfile>(sql('get_profile'), [id], executor)
  return rows[0]
}

export async function byPhone(
  phone_number: string,
  executor?: Executor
): Promise<User | undefined> {
  const { rows } = await query<User>(sql('by_phone'), [phone_number], executor)
  return rows[0]
}

export async function byEmail(email: string, executor?: Executor): Promise<User | undefined> {
  const { rows } = await query<User>(sql('by_email'), [email], executor)
  return rows[0]
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      User,
      | 'email'
      | 'name'
      | 'emailVerified'
      | 'phone_number'
      | 'phone_number_verified'
      | 'deletion_requested_at'
    >
  >,
  tx: PoolClient
): Promise<User | undefined> {
  const { rows } = await query<User>(
    sql('update'),
    [
      id,
      patch.email ?? null,
      patch.name ?? null,
      patch.emailVerified ?? null,
      patch.phone_number ?? null,
      patch.phone_number_verified ?? null,
      patch.deletion_requested_at ?? null,
    ],
    tx
  )
  return rows[0]
}
