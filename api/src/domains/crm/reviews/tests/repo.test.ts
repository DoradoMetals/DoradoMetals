import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as reviews from '#db/reviews/repo.ts'

test('update returns undefined for an id nothing names', async () => {
  await inPinnedTransaction(
    async (client) => {
      const written = await reviews.update(
        randomUUID(),
        { review_text: 'should not land anywhere' },
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
      const created = await reviews.create({ name: 'Repo Fixture', hidden: false }, client)

      const written = await reviews.update(
        created.id,
        { review_text: 'touched by repo.test.ts' },
        client
      )
      assert.equal(written?.review_text, 'touched by repo.test.ts')
      assert.deepEqual(written, await reviews.getOne(created.id, client))
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the public projection never carries the staff member who wrote or edited a review', async () => {
  await inPinnedTransaction(
    async (client) => {
      const created = await reviews.create(
        { name: 'Public Fixture', review_text: 'lovely', rating: 5, hidden: false },
        client
      )

      const admin = await reviews.getOne(created.id, client)
      assert.ok(admin?.created_by, 'the audit trigger stamped no author - the fixture is wrong')

      const [row] = (await reviews.getPublic(client)).filter((r) => r.id === created.id)
      assert.ok(row, 'the new review is not on the public list')
      const keys = Object.keys(row)
      for (const secret of ['created_by', 'updated_by', 'created_by_id', 'updated_by_id']) {
        assert.ok(!keys.includes(secret), `${secret} is on the unauthenticated wire`)
      }
      assert.ok(!keys.includes('user_id'), 'user_id is on the unauthenticated wire')
      assert.equal(typeof row.created_at, 'string', 'the public row must parse as its contract')
    },
    { actor: TEST_ACTOR.id }
  )
})
