import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import {
  aLead,
  anEstimateItem,
  anUnknownId,
  estimateKindId,
  estimateUnitId,
  purityLabelId,
} from '#shared/testing/builders/index.ts'
import * as items from '#db/leads/estimate-items/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('create writes the line and answers the written row', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const written = await anEstimateItem(c, lead.id, { weight: 4.5, metal_id: 'Silver' })

    assert.equal(written.lead_id, lead.id)
    assert.equal(written.weight, 4.5)
    assert.equal(written.metal_id, 'Silver')
    assert.ok(written.id, 'no id came back')
    assert.ok(written.created_at, 'the database did not stamp created_at')
    assert.deepEqual(written, await items.getOne(lead.id, written.id, c))
  })
})

test('forLead answers only the lines of the lead it was asked about', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aLead(c)
    const theirs = await aLead(c)
    const first = await anEstimateItem(c, mine.id, { weight: 1 })
    const second = await anEstimateItem(c, mine.id, { weight: 2 })
    const other = await anEstimateItem(c, theirs.id, { weight: 3 })

    const rows = await items.forLead(mine.id, c)
    assert.deepEqual(new Set(rows.map((r) => r.id)), new Set([first.id, second.id]))
    assert.ok(!rows.some((r) => r.id === other.id), 'another lead line leaked in')
  })
})

test('forLead answers oldest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const newer = await anEstimateItem(c, lead.id, { weight: 1 })
    const older = await anEstimateItem(c, lead.id, { weight: 2 })

    // Two rows written in one transaction share its now(), so one of them has
    // to be pushed back for the ordering to be observable at all.
    await c.query(
      `UPDATE leads.estimate_items SET created_at = created_at - interval '1 hour' WHERE id = $1`,
      [older.id]
    )

    const rows = await items.forLead(lead.id, c)
    assert.deepEqual(
      rows.map((r) => r.id),
      [older.id, newer.id]
    )
  })
})

test('a custom purity is accepted in place of a purity label', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const written = await anEstimateItem(c, lead.id, { custom_purity: 0.42 })

    assert.equal(written.purity_id, null)
    assert.equal(written.custom_purity, 0.42)
  })
})

test('update writes the patch and answers the written row', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)

    const written = await items.update(lead.id, item.id, { weight: 99 }, c)
    assert.equal(written?.weight, 99)
    assert.deepEqual(written, await items.getOne(lead.id, item.id, c))
  })
})

test('an empty patch answers the row unchanged rather than rewriting it', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)

    const written = await items.update(lead.id, item.id, {}, c)
    assert.deepEqual(written, item)
  })
})

test('a patch may swap a purity label for a custom purity', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)

    const written = await items.update(
      lead.id,
      item.id,
      { purity_id: null, custom_purity: 0.77 },
      c
    )
    assert.equal(written?.purity_id, null)
    assert.equal(written?.custom_purity, 0.77)
  })
})

test('every verb is scoped by lead, so another lead item id reaches nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aLead(c)
    const theirs = await aLead(c)
    const item = await anEstimateItem(c, theirs.id)

    assert.equal(await items.getOne(mine.id, item.id, c), undefined)
    assert.equal(await items.update(mine.id, item.id, { weight: 5 }, c), undefined)
    assert.equal(await items.remove(mine.id, item.id, c), false)
    assert.ok(await items.getOne(theirs.id, item.id, c), 'the owner lost its own item')
  })
})

test('remove deletes the line and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)

    assert.equal(await items.remove(lead.id, item.id, c), true)
    assert.equal(await items.getOne(lead.id, item.id, c), undefined)
    assert.equal(await items.remove(lead.id, item.id, c), false)
  })
})

test('update answers undefined for an id that names no line', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.equal(await items.update(lead.id, anUnknownId(), { weight: 1 }, c), undefined)
  })
})

test('deleting the lead takes its estimate lines with it', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    await anEstimateItem(c, lead.id)

    await c.query(`DELETE FROM leads.leads WHERE id = $1`, [lead.id])
    assert.deepEqual(await items.forLead(lead.id, c), [])
  })
})

test('the database refuses a line with two fineness answers, and one with none', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const kind_id = await estimateKindId(c, 'scrap')
    const unit_id = await estimateUnitId(c, 'troy_oz')
    const purity_id = await purityLabelId(c, 'Gold', '14K')

    await assert.rejects(
      items.create(
        lead.id,
        { kind_id, metal_id: 'Gold', weight: 1, unit_id, purity_id, custom_purity: 0.5 },
        c
      ),
      /estimate_items_one_purity/
    )
  })
})

test('the database refuses a line with neither fineness answer', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const kind_id = await estimateKindId(c, 'scrap')
    const unit_id = await estimateUnitId(c, 'troy_oz')

    await assert.rejects(
      items.create(lead.id, { kind_id, metal_id: 'Gold', weight: 1, unit_id }, c),
      /estimate_items_one_purity/
    )
  })
})

test('the database refuses a weight of nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    await assert.rejects(
      anEstimateItem(c, lead.id, { weight: 0 }),
      /estimate_items_weight_positive/
    )
  })
})
