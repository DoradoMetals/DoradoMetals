import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as addressService from '#accounts/places/addresses/service.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAddress } from '#shared/testing/builders/index.ts'

const taxingState = async (): Promise<string | null> => {
  const rows = await outside<{ state: string }>(
    `SELECT state_code AS state FROM tax.sales_tax_rules
      WHERE tax_rate > 0 ORDER BY tax_rate DESC, id ASC LIMIT 1`
  )
  return rows[0]?.state ?? null
}

afterAll(async () => {
  await pool.end()
})

test('getAddressFromId returns the row, so .state is the state', async () => {
  const state = await taxingState()
  assert.ok(state, 'dev has no sales-tax rule that charges tax')
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      const built = await anAddress(c, owner, { state })
      const address = await addressService.getAddressFromId(built.id)

      assert.ok(address, `getAddressFromId could not read address ${built.id}`)
      assert.ok(!Array.isArray(address), 'this one is a row')
      assert.equal(address.state, state)
      assert.equal(typeof address.state, 'string')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES }
  )
})
