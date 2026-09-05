import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import { runWithActor, currentActor } from '#shared/http/actor.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as reviews from '#crm/reviews/service.ts'
import * as reviewsRepo from '#db/reviews/repo.ts'

type Person = { id: string; name: string }

const twoPeople = async (c: PoolClient): Promise<[Person, Person]> => {
  const alice = await aUser(c, { name: 'Alice Author' })
  const bob = await aUser(c, { name: 'Bob Editor' })
  return [alice, bob]
}

const auditOf = async (c: PoolClient, id: string) =>
  (
    await c.query(
      `SELECT created_at, updated_at, created_by, updated_by, created_by_id, updated_by_id
       FROM reviews.reviews WHERE id = $1`,
      [id]
    )
  ).rows[0] as Record<string, unknown>

test('the actor who creates and the actor who edits are both recorded, by the database', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const [alice, bob] = await twoPeople(c)

      const created = await runWithActor(alice.id, () =>
        reviews.create({
          name: 'Audit probe',
          review_text: 'made by alice',
          rating: 5,
          hidden: true,
        })
      )

      const onCreate = await auditOf(c, created.id)
      assert.equal(onCreate.created_by_id, alice.id, 'the create did not stamp its actor')
      assert.equal(onCreate.updated_by_id, alice.id, "a new row's last editor is its author")
      assert.equal(onCreate.created_by, alice.name, 'the legacy name column went unfilled')
      assert.equal(onCreate.updated_by, alice.name)
      assert.deepEqual(
        onCreate.updated_at,
        onCreate.created_at,
        'a row that has never been edited must not claim to have been'
      )

      await runWithActor(bob.id, () => reviews.update(created.id, { review_text: 'edited by bob' }))

      const onUpdate = await auditOf(c, created.id)
      assert.equal(onUpdate.created_by_id, alice.id, 'the update rewrote created_by_id')
      assert.equal(onUpdate.created_by, alice.name, 'the update rewrote created_by')
      assert.deepEqual(onUpdate.created_at, onCreate.created_at, 'the update rewrote created_at')

      assert.equal(onUpdate.updated_by_id, bob.id, 'the edit was attributed to the wrong person')
      assert.equal(onUpdate.updated_by, bob.name)
      assert.ok(
        (onUpdate.updated_at as Date) > (onCreate.created_at as Date),
        `updated_at (${onUpdate.updated_at}) did not move past created_at (${onCreate.created_at})`
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a row created and edited in one transaction still records two different times', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const [alice] = await twoPeople(c)
      const created = await runWithActor(alice.id, () =>
        reviews.create({ name: 'Clock probe', review_text: 't', rating: 4, hidden: true })
      )
      await runWithActor(alice.id, () => reviews.update(created.id, { rating: 3 }))

      const row = await auditOf(c, created.id)
      assert.ok(
        (row.updated_at as Date) > (row.created_at as Date),
        'created and edited inside one transaction produced one timestamp - now() is back'
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a write with no actor leaves the author alone rather than inventing one', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const [alice] = await twoPeople(c)
      const created = await runWithActor(alice.id, () =>
        reviews.create({ name: 'System probe', review_text: 't', rating: 4, hidden: true })
      )

      assert.equal(currentActor(), null, 'the actor escaped its runWithActor scope')
      await reviews.update(created.id, { rating: 2 })

      const row = await auditOf(c, created.id)
      assert.equal(row.updated_by_id, alice.id, 'an unattributed write erased the author')
      assert.equal(row.updated_by, alice.name)
    },
    { actor: null }
  )
})

test('withTransaction takes an actor directly, for callers with no request', async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [alice, bob] = await twoPeople(c)
    const created = await runWithActor(alice.id, () =>
      reviews.create({ name: 'Override probe', review_text: 't', rating: 4, hidden: true })
    )

    await withTransaction((client) => reviewsRepo.update(created.id, { rating: 1 }, client), {
      actor: bob.id,
    })

    const row = await auditOf(c, created.id)
    assert.equal(row.updated_by_id, bob.id, 'the explicit actor did not reach the connection')
  })
})
