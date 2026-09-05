import { test, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

type User = { id: string; name: string; email: string }

let admin: User
let customer: User

beforeAll(async () => {
  admin = TEST_ACTOR
  customer = TEST_CUSTOMER
})

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: 'user' }, fn)

const NEW_LEAD = {
  name: 'Restructure Fixture',
  phone: '5550001111',
  email: 'fixture@example.invalid',
}

test('a customer cannot reach any lead route', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        assert.equal((await request(app).get('/api/leads')).status, 403)
        assert.equal((await request(app).post('/api/leads').send(NEW_LEAD)).status, 403)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('create writes the row the id names', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(async () => {
        const res = await request(app).post('/api/leads').send(NEW_LEAD)
        assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.ok(res.body.id, 'no id came back')

        const nu = await client.query(`SELECT id, name FROM leads.leads WHERE id = $1`, [
          res.body.id,
        ])
        assert.equal(nu.rows.length, 1, 'not written to leads.leads')
        assert.equal(nu.rows[0].name, NEW_LEAD.name)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the read serves what the table holds', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(async () => {
        const res = await request(app).post('/api/leads').send(NEW_LEAD)
        const id = res.body.id

        await client.query(`UPDATE leads.leads SET name = $1 WHERE id = $2`, [
          'FROM-NEW-SCHEMA',
          id,
        ])

        const one = await request(app).get(`/api/leads/${id}`)
        assert.equal(one.status, 200)
        assert.equal(one.body.name, 'FROM-NEW-SCHEMA', 'the read did not serve the row')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('update writes the row, and delete removes it', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(async () => {
        const created = (await request(app).post('/api/leads').send(NEW_LEAD)).body

        const upd = await request(app).patch(`/api/leads/${created.id}`).send({ name: 'Renamed' })
        assert.equal(upd.status, 200)
        const { rows: renamed } = await client.query(`SELECT name FROM leads.leads WHERE id = $1`, [
          created.id,
        ])
        assert.equal(renamed[0]?.name, 'Renamed', 'leads.leads was not updated')

        const del = await request(app).delete(`/api/leads/${created.id}`)
        assert.equal(del.status, 200)
        const { rows: gone } = await client.query(`SELECT 1 FROM leads.leads WHERE id = $1`, [
          created.id,
        ])
        assert.equal(gone.length, 0, 'leads.leads still holds the deleted lead')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an id that names no lead is 404, not an empty 200', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app).get('/api/leads/11111111-1111-1111-1111-111111111111')
        assert.equal(res.status, 404, `answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('deleting an id that names nothing is 404, not a success', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app).delete('/api/leads/11111111-1111-1111-1111-111111111111')
        assert.equal(res.status, 404, `answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
