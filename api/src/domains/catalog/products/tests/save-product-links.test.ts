import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

let product: { id: string; metal_id: string; name: string }

beforeAll(async () => {
  const { rows } = await query<typeof product>(
    'SELECT id, metal_id, name FROM products.bullion LIMIT 1'
  )
  assert.ok(rows[0], 'dev has no product in products.bullion')
  product = rows[0]
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const NOBODY = '00000000-0000-0000-0000-000000000000'

const patchMetal = (metal_id: string) =>
  request(app).patch(`/api/products/${product.id}`).send({ metal_id })

test('a metal id that does not exist is refused, and nothing is written', async () => {
  const [before] = await outside(`SELECT metal_id FROM products.bullion WHERE id = $1`, [
    product.id,
  ])

  await inPinnedTransaction(
    async () => {
      await as({ ...TEST_ACTOR, role: 'admin' }, async () => {
        const res = await patchMetal(NOBODY)
        assert.ok(res.status >= 400, `an unmatched metal id was answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )

  const [afterRow] = await outside(`SELECT metal_id FROM products.bullion WHERE id = $1`, [
    product.id,
  ])
  assert.equal(afterRow.metal_id, before.metal_id, 'the failed save changed the product')
  assert.ok(afterRow.metal_id, 'the product lost its metal')
})

test("a patch naming the product's own metal id succeeds and keeps the link", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...TEST_ACTOR, role: 'admin' }, async () => {
        const res = await patchMetal(product.metal_id)
        assert.equal(
          res.status,
          200,
          `an honest patch answered ${res.status}: ${JSON.stringify(res.body)}`
        )

        const { rows } = await client.query(
          `SELECT metal_id, name FROM products.bullion WHERE id = $1`,
          [product.id]
        )
        assert.equal(rows[0].metal_id, product.metal_id, 'an honest patch lost the metal')
        assert.equal(rows[0].name, product.name)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
