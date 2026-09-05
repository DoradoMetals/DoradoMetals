import * as users from '#db/users/repo.ts'
import type { AdminUser } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

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
