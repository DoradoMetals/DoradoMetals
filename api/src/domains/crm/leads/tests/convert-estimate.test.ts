// POST /api/leads/:id/convert with `carry_estimate` (FOLLOWUPS; leads-port
// "Convert"). LeadConvertBody gains `carry_estimate: boolean`, default true.
// When it is true the new customer's purchase checkout (checkout.checkouts,
// direction 'purchase') holds one scrap lot per estimate item, carrying the
// item's metal and fine fraction (a purity label's purity, or custom_purity).
// When it is false the customer is created with no checkout lots at all.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LeadConvertBody } from '@dorado/contracts'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import {
  aLead,
  aTag,
  anEstimateItem,
  estimateUnitId,
  purityLabelId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inConvert = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] })

async function aLeadWithEstimate(c: PoolClient) {
  const tag = aTag()
  const lead = await aLead(c, { name: `Carry ${tag}`, email: `${tag}@dorado.test` })
  await anEstimateItem(c, lead.id, {
    metal_id: 'Gold',
    weight: 10,
    unit_id: await estimateUnitId(c, 'troy_oz'),
    purity_id: await purityLabelId(c, 'Gold', '14K'),
  })
  await anEstimateItem(c, lead.id, {
    metal_id: 'Silver',
    weight: 20,
    unit_id: await estimateUnitId(c, 'g'),
    purity_id: await purityLabelId(c, 'Silver', '.925'),
  })
  return lead
}

async function checkoutLots(c: PoolClient, user_id: string) {
  const { rows } = await c.query<{ metal_id: string; purity: number }>(
    `SELECT l.metal_id, l.purity
       FROM checkout.checkouts ch
       JOIN checkout.lots cl ON cl.checkout_id = ch.id
       JOIN inventory.lots l ON l.id = cl.lot_id
      WHERE ch.user_id = $1 AND ch.direction = 'purchase'
      ORDER BY l.metal_id`,
    [user_id]
  )
  return rows.map((r) => ({ metal_id: r.metal_id, purity: Number(r.purity) }))
}

const convert = (lead_id: string, body: LeadConvertBody) =>
  asAdmin(TEST_ACTOR, () => request(app).post(`/api/leads/${lead_id}/convert`).send(body))

test('carry_estimate defaults to true: the new customer checkout holds the estimate items', async () => {
  await inConvert(async (c) => {
    const lead = await aLeadWithEstimate(c)
    const res = await convert(lead.id, {})
    assert.equal(res.status, 201, res.text)

    assert.deepEqual(await checkoutLots(c, res.body.id), [
      { metal_id: 'Gold', purity: 0.5833 },
      { metal_id: 'Silver', purity: 0.925 },
    ])
  })
})

test('carry_estimate: true carries them the same way', async () => {
  await inConvert(async (c) => {
    const lead = await aLeadWithEstimate(c)
    const res = await convert(lead.id, { carry_estimate: true })
    assert.equal(res.status, 201, res.text)
    assert.equal((await checkoutLots(c, res.body.id)).length, 2)
  })
})

test('carry_estimate: false creates the customer with no checkout lots', async () => {
  await inConvert(async (c) => {
    const lead = await aLeadWithEstimate(c)
    const res = await convert(lead.id, { carry_estimate: false })
    assert.equal(res.status, 201, res.text)
    assert.deepEqual(await checkoutLots(c, res.body.id), [])
  })
})

test('a custom purity is carried as the lot purity', async () => {
  await inConvert(async (c) => {
    const tag = aTag()
    const lead = await aLead(c, { name: `Custom ${tag}`, email: `${tag}@dorado.test` })
    await anEstimateItem(c, lead.id, { metal_id: 'Gold', custom_purity: 0.62, purity_id: null })
    const res = await convert(lead.id, {})
    assert.equal(res.status, 201, res.text)
    assert.deepEqual(await checkoutLots(c, res.body.id), [{ metal_id: 'Gold', purity: 0.62 }])
  })
})

test('a lead with no estimate items converts with carry_estimate on and an empty checkout', async () => {
  await inConvert(async (c) => {
    const tag = aTag()
    const lead = await aLead(c, { name: `Empty ${tag}`, email: `${tag}@dorado.test` })
    const res = await convert(lead.id, { carry_estimate: true })
    assert.equal(res.status, 201, res.text)
    assert.deepEqual(await checkoutLots(c, res.body.id), [])
  })
})

test('carry_estimate must be a boolean', async () => {
  await inConvert(async (c) => {
    const lead = await aLeadWithEstimate(c)
    const res = await asAdmin(TEST_ACTOR, () =>
      request(app).post(`/api/leads/${lead.id}/convert`).send({ carry_estimate: 'yes' })
    )
    assert.equal(res.status, 400, res.text)
  })
})

test('the estimate items stay on the lead after the carry', async () => {
  await inConvert(async (c) => {
    const lead = await aLeadWithEstimate(c)
    assert.equal((await convert(lead.id, {})).status, 201)
    const { rows } = await c.query(
      'SELECT count(*)::int AS n FROM leads.estimate_items WHERE lead_id = $1',
      [lead.id]
    )
    assert.equal(rows[0].n, 2, 'the carry moved or deleted the lead estimate')
  })
})
