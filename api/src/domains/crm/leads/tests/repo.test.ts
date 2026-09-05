import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as leads from '#db/leads/repo.ts'

test('update returns undefined for an id nothing names', async () => {
  await inPinnedTransaction(
    async (client) => {
      const written = await leads.update(
        randomUUID(),
        { notes: 'should not land anywhere' },
        client
      )
      assert.equal(written, undefined, 'an update against a missing id answered a row')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('update answers the written row for a real id, with the change on it', async () => {
  await inPinnedTransaction(
    async (client) => {
      const created = await leads.create({ name: 'Repo Fixture', phone: null, email: null }, client)

      const written = await leads.update(created.id, { notes: 'touched by repo.test.ts' }, client)
      assert.equal(written?.notes, 'touched by repo.test.ts')
      assert.deepEqual(written, await leads.getOne(created.id, client))
    },
    { actor: TEST_ACTOR.id }
  )
})
