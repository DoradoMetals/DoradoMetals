import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import {
  aLead,
  anEstimateItem,
  anUnknownId,
  estimateKindId,
  estimateUnitId,
  purityLabelId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as(
    { id: TEST_CUSTOMER.id, name: TEST_CUSTOMER.name, email: TEST_CUSTOMER.email, role: 'user' },
    fn
  )

async function aLine(c: PoolClient) {
  return {
    kind_id: await estimateKindId(c, 'scrap'),
    metal_id: 'Gold',
    weight: 7.5,
    unit_id: await estimateUnitId(c, 'dwt'),
    purity_id: await purityLabelId(c, 'Gold', '18K'),
  }
}

test('a customer cannot reach any estimate route', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asCustomer(async () => {
        assert.equal((await request(app).get(`/api/leads/${lead.id}/estimate/items`)).status, 403)
        assert.equal(
          (await request(app).post(`/api/leads/${lead.id}/estimate/items`).send({})).status,
          403
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('POST writes the line, GET serves it back', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const line = await aLine(c)

      await asAdmin(async () => {
        const made = await request(app).post(`/api/leads/${lead.id}/estimate/items`).send(line)
        assert.equal(made.status, 201, JSON.stringify(made.body))
        assert.ok(made.body.id)
        assert.equal(made.body.lead_id, lead.id)
        assert.equal(made.body.weight, 7.5)

        const listed = await request(app).get(`/api/leads/${lead.id}/estimate/items`)
        assert.equal(listed.status, 200)
        assert.deepEqual(
          listed.body.map((row: { id: string }) => row.id),
          [made.body.id]
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('PATCH edits the line and DELETE removes it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const item = await anEstimateItem(c, lead.id)

      await asAdmin(async () => {
        const url = `/api/leads/${lead.id}/estimate/items/${item.id}`
        const patched = await request(app).patch(url).send({ weight: 44 })
        assert.equal(patched.status, 200, JSON.stringify(patched.body))
        assert.equal(patched.body.weight, 44)

        const gone = await request(app).delete(url)
        assert.equal(gone.status, 200)
        assert.deepEqual((await request(app).get(`/api/leads/${lead.id}/estimate/items`)).body, [])
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an unknown field in the body is refused, not ignored', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const line = await aLine(c)

      await asAdmin(async () => {
        const bad = await request(app)
          .post(`/api/leads/${lead.id}/estimate/items`)
          .send({ ...line, price: 1200 })
        assert.equal(bad.status, 400, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a line with both fineness answers is refused with 422', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const line = await aLine(c)

      await asAdmin(async () => {
        const bad = await request(app)
          .post(`/api/leads/${lead.id}/estimate/items`)
          .send({ ...line, custom_purity: 0.5 })
        assert.equal(bad.status, 422, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a line with neither fineness answer is refused with 422', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const line = await aLine(c)

      await asAdmin(async () => {
        const bad = await request(app)
          .post(`/api/leads/${lead.id}/estimate/items`)
          .send({ ...line, purity_id: null })
        assert.equal(bad.status, 422, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a line missing a required fact is refused with 422', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const line = await aLine(c)

      await asAdmin(async () => {
        for (const field of ['kind_id', 'metal_id', 'unit_id', 'weight']) {
          const body: Record<string, unknown> = { ...line }
          delete body[field]
          const bad = await request(app).post(`/api/leads/${lead.id}/estimate/items`).send(body)
          assert.equal(bad.status, 422, `${field}: ${JSON.stringify(bad.body)}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a patch that would leave two fineness answers is refused', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const item = await anEstimateItem(c, lead.id)

      await asAdmin(async () => {
        const bad = await request(app)
          .patch(`/api/leads/${lead.id}/estimate/items/${item.id}`)
          .send({ custom_purity: 0.5 })
        assert.equal(bad.status, 422, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an id that names no lead is 404 on the list and on the write', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const line = await aLine(c)
      const absent = anUnknownId()

      await asAdmin(async () => {
        assert.equal((await request(app).get(`/api/leads/${absent}/estimate/items`)).status, 404)
        assert.equal(
          (await request(app).post(`/api/leads/${absent}/estimate/items`).send(line)).status,
          404
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an item id from another lead is 404, never an edit to that other lead', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const mine = await aLead(c)
      const theirs = await aLead(c)
      const item = await anEstimateItem(c, theirs.id)

      await asAdmin(async () => {
        const url = `/api/leads/${mine.id}/estimate/items/${item.id}`
        assert.equal((await request(app).patch(url).send({ weight: 1 })).status, 404)
        assert.equal((await request(app).delete(url)).status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a lead id that is not a uuid is 400', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        assert.equal((await request(app).get('/api/leads/not-a-uuid/estimate/items')).status, 400)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
