import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as rates from '#db/rates/repo.ts'
import * as metals from '#db/metals/repo.ts'

test('update returns false for an id nothing names', async () => {
  await inPinnedTransaction(
    async (client) => {
      const changed = await rates.update(randomUUID(), { unit: 'oz' }, client)
      assert.equal(changed, false, 'an update against a missing id reported a change')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('update returns true for a real id, and the row actually changed', async () => {
  await inPinnedTransaction(
    async (client) => {
      const [metal] = await metals.list(client)
      assert.ok(metal, 'dev has no metal to band a rate against')

      const id = await rates.create(
        {
          metal_id: metal.id,
          unit: 'oz',
          min_qty: 0,
          max_qty: null,
          scrap_pct: 0.9,
          bullion_pct: 0.95,
        },
        client
      )

      const changed = await rates.update(id, { scrap_pct: 0.5 }, client)
      assert.equal(changed, true, 'an update against a real id reported no change')

      const row = await rates.getOne(id, client)
      assert.equal(Number(row?.scrap_pct), 0.5)
    },
    { actor: TEST_ACTOR.id }
  )
})
