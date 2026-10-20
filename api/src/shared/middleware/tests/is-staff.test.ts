import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isStaff } from '#shared/middleware/authMiddleware.ts'

const as = (role: string | undefined) => ({ user: role ? { role } : undefined }) as never

test('isStaff follows the role ladder, so a renamed staff role is one edit in one place', () => {
  assert.equal(isStaff(as('admin')), true)
  assert.equal(isStaff(as('verified_user')), false)
  assert.equal(isStaff(as('user')), false)
  assert.equal(isStaff(as('stranger')), false)
  assert.equal(isStaff(as(undefined)), false)
})
