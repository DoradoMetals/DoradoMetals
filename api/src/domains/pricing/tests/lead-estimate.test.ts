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
import * as pricing from '#db/pricing/repo.ts'

afterAll(async () => {
  await pool.end()
})

const TROY_GRAMS = 31.1034768

async function bidFor(c: PoolClient, metal_id: string): Promise<number | null> {
  const { rows } = await c.query<{ bid: number | null }>(
    `SELECT bid FROM spots.spots WHERE metal_id = $1`,
    [metal_id]
  )
  return rows[0]?.bid ?? null
}

async function bandFor(c: PoolClient, metal_id: string, content: number): Promise<number> {
  const { rows } = await c.query<{ scrap_pct: number }>(
    `SELECT r.scrap_pct
       FROM rates.rates r
      WHERE r.metal_id = $1
      ORDER BY ($2::numeric >= r.min_qty AND (r.max_qty IS NULL OR $2::numeric <= r.max_qty)) DESC,
               CASE WHEN $2::numeric >= r.min_qty AND (r.max_qty IS NULL OR $2::numeric <= r.max_qty)
                    THEN r.min_qty END ASC NULLS LAST,
               CASE WHEN $2::numeric < (SELECT min(r2.min_qty) FROM rates.rates r2
                                WHERE r2.metal_id = $1)
                    THEN r.min_qty END ASC NULLS LAST,
               r.min_qty DESC,
               r.id ASC
      LIMIT 1`,
    [metal_id, content]
  )
  return rows[0]!.scrap_pct
}

test('an estimate with no lines prices at zero rather than refusing', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const estimate = await pricing.leadEstimate(lead.id, c)

    assert.equal(estimate?.lead_id, lead.id)
    assert.deepEqual(estimate?.items, [])
    assert.equal(estimate?.total, 0)
    assert.ok(estimate?.spots_at, 'the quote carries no spot timestamp')
  })
})

test('a lead id that names nothing answers undefined, so the service can refuse', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await pricing.leadEstimate(anUnknownId(), c), undefined)
  })
})

test('a 14K gold line is weighed, converted and priced at the band for its content', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    await anEstimateItem(c, lead.id, { metal_id: 'Gold', weight: 10 })

    const estimate = await pricing.leadEstimate(lead.id, c)
    const line = estimate!.items[0]!

    const content = 10 * 0.5833
    assert.ok(Math.abs(line.content - content) < 1e-6, `content was ${line.content}`)
    assert.ok(Math.abs(line.purity - 0.5833) < 1e-9)

    const band = await bandFor(c, 'Gold', content)
    const bid = await bidFor(c, 'Gold')
    assert.ok(Math.abs(line.premium - band) < 1e-9, `premium was ${line.premium}`)
    assert.ok(Math.abs(line.value - content * (bid ?? 0) * band) < 1e-6, `value was ${line.value}`)
    assert.ok(Math.abs(estimate!.total - line.value) < 1e-6)
  })
})

test('grams, pennyweights and pounds convert through the weight_units rows', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const kind_id = await estimateKindId(c, 'scrap')
    const purity_id = await purityLabelId(c, 'Silver', '.999')

    await anEstimateItem(c, lead.id, {
      kind_id,
      metal_id: 'Silver',
      weight: TROY_GRAMS,
      unit_id: await estimateUnitId(c, 'g'),
      purity_id,
    })

    const estimate = await pricing.leadEstimate(lead.id, c)
    const line = estimate!.items[0]!
    assert.ok(
      Math.abs(line.content - 0.999) < 1e-9,
      `one troy ounce of grams did not come back as one troy ounce: ${line.content}`
    )
  })
})

test('a custom purity prices the same way a labelled one does', async () => {
  await inRollback(async (c: PoolClient) => {
    const labelled = await aLead(c)
    const custom = await aLead(c)
    await anEstimateItem(c, labelled.id, { metal_id: 'Gold', weight: 2 })
    await anEstimateItem(c, custom.id, { metal_id: 'Gold', weight: 2, custom_purity: 0.5833 })

    const one = await pricing.leadEstimate(labelled.id, c)
    const two = await pricing.leadEstimate(custom.id, c)
    assert.ok(Math.abs(one!.total - two!.total) < 1e-6, `${one!.total} vs ${two!.total}`)
  })
})

test('a bullion line draws the bullion band, not the scrap one', async () => {
  await inRollback(async (c: PoolClient) => {
    const scrap = await aLead(c)
    const bullion = await aLead(c)
    await anEstimateItem(c, scrap.id, { metal_id: 'Gold', weight: 1 })
    await anEstimateItem(c, bullion.id, {
      metal_id: 'Gold',
      weight: 1,
      kind_id: await estimateKindId(c, 'bullion'),
    })

    const scrapped = await pricing.leadEstimate(scrap.id, c)
    const bulled = await pricing.leadEstimate(bullion.id, c)
    assert.equal(scrapped!.items[0]!.kind, 'scrap')
    assert.equal(bulled!.items[0]!.kind, 'bullion')
    assert.ok(
      bulled!.items[0]!.premium > scrapped!.items[0]!.premium,
      'the bullion band is not better than the scrap band'
    )
  })
})

test('a metal with no live bid is named in unpriceable rather than silently zeroed', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id, {
      metal_id: 'Palladium',
      purity_id: await purityLabelId(c, 'Palladium', '.950'),
    })
    await c.query(`UPDATE spots.spots SET bid = NULL WHERE metal_id = 'Palladium'`)

    const estimate = await pricing.leadEstimate(lead.id, c)
    assert.deepEqual(estimate?.unpriceable, [item.id])
    assert.equal(estimate?.total, 0)
  })
})

test('the totals read answers one row per asked lead, zero included', async () => {
  await inRollback(async (c: PoolClient) => {
    const priced = await aLead(c)
    const empty = await aLead(c)
    await anEstimateItem(c, priced.id, { metal_id: 'Gold', weight: 3 })

    const totals = await pricing.leadEstimateTotals([priced.id, empty.id], c)
    assert.equal(totals.length, 2)

    const one = totals.find((row) => row.lead_id === priced.id)
    const none = totals.find((row) => row.lead_id === empty.id)
    assert.ok(one!.total > 0, 'a priced lead totalled nothing')
    assert.equal(none!.total, 0)

    const single = await pricing.leadEstimate(priced.id, c)
    assert.ok(Math.abs(one!.total - single!.total) < 1e-6, 'the two reads disagree')
  })
})

test('an unknown lead id in the totals read answers a zero, not a gap', async () => {
  await inRollback(async (c: PoolClient) => {
    const unknown = anUnknownId()
    const totals = await pricing.leadEstimateTotals([unknown], c)
    assert.deepEqual(totals, [{ lead_id: unknown, total: 0 }])
  })
})
