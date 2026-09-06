import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { User } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(id: string, executor?: Executor): Promise<User | undefined> {
  const { rows } = await query<User>(sql('get_one'), [id], executor)
  return rows[0]
}

// The partial unique index makes a number one account's, so this is a row.
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

// auth.users is better-auth's table and half its columns are camelCase, which
// buildUpdate cannot quote. The writable set is named in SQL instead, and a
// null argument leaves the column alone.
export async function update(
  id: string,
  patch: Partial<
    Pick<User, 'email' | 'name' | 'emailVerified' | 'phone_number' | 'phone_number_verified'>
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
    ],
    tx
  )
  return rows[0]
}
