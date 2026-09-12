import * as users from '#db/users/repo.ts'
import * as authUsers from '#db/auth/users/repo.ts'
import * as rules from '#accounts/users/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { AdminUser, UserCreateFacts, UserPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import type { PoolClient } from 'pg'

export async function getUser(id: string): Promise<AdminUser | undefined> {
  return await users.getOne(id)
}

export async function getAllUsers(): Promise<AdminUser[]> {
  return await users.list()
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return await users.getAdmins()
}

export async function exists(id: string, executor?: Executor): Promise<boolean> {
  return await users.exists(id, executor)
}

export async function patch(id: string, body: UserPatch): Promise<AdminUser> {
  rules.assertBanReasonGiven(body)
  return withTransaction(async (tx) => {
    const written = await users.updateFacts(id, body, tx)
    rules.assertWritten(written, id)
    const row = await users.getOne(id, tx)
    rules.assertUser(row, id)
    return row
  })
}

export async function createFromLead(facts: UserCreateFacts, tx: PoolClient): Promise<AdminUser> {
  rules.assertEmailPresent(facts.email)
  const byEmail = await authUsers.byEmail(facts.email, tx)
  rules.assertEmailAvailable(byEmail, facts.email)
  if (facts.phone_number) {
    const byPhone = await authUsers.byPhone(facts.phone_number, tx)
    rules.assertPhoneAvailable(byPhone, facts.phone_number)
  }
  const id = await users.create(facts, tx)
  const row = await users.getOne(id, tx)
  rules.assertUser(row, id)
  return row
}
