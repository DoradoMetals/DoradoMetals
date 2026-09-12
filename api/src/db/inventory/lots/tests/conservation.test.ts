import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import * as lotSources from '#db/inventory/lot-sources/repo.ts'

afterAll(async () => {
  await pool.end()
})

const inLots = <T>(fn: (c: PoolClient) => Promise<T>) => inRollback(fn, { actor: TEST_ACTOR.id })

test('split conserves content: the children sum to what the parent held before the split', async () => {
  await inLots(async (c) => {
    const parent = await lots.create(
      { metal_id: 'Gold', pre_melt: 30, purity: 0.75, unit: 't oz' },
      c
    )
    const before = Number(parent.content)

    const children = await lots.splitOff(
      parent.id,
      [
        { pre_melt: 18, purity: 0.75, unit: 't oz' },
        { pre_melt: 12, purity: 0.75, unit: 't oz' },
      ],
      c
    )
    const after = children.reduce((sum, child) => sum + Number(child.content), 0)
    assert.ok(Math.abs(after - before) < 1e-9, `expected ${before}, got ${after}`)

    for (const child of children) {
      const edges = await lotSources.getFor(child.id, c)
      assert.equal(edges.length, 1)
      assert.equal(edges[0]?.source_lot_id, parent.id)
      assert.equal(edges[0]?.kind, 'split')
    }
  })
})

test('combine conserves content: the result equals what the parents held going in', async () => {
  await inLots(async (c) => {
    const a = await lots.create({ metal_id: 'Silver', pre_melt: 10, purity: 0.9, unit: 't oz' }, c)
    const b = await lots.create({ metal_id: 'Silver', pre_melt: 20, purity: 0.6, unit: 't oz' }, c)
    const before = Number(a.content) + Number(b.content)

    const combined = await lots.combine([a.id, b.id], c)
    await lots.linkCombined([a.id, b.id], combined.id, c)

    assert.ok(Math.abs(Number(combined.content) - before) < 1e-9)

    const edges = await lotSources.getFor(combined.id, c)
    assert.equal(edges.length, 2)
    assert.deepEqual(
      edges.map((edge) => edge.source_lot_id).sort(),
      [a.id, b.id].sort()
    )
    assert.ok(edges.every((edge) => edge.kind === 'combine'))
  })
})

test('a batch edge starts the refiner lot equal to what the customer lot declared', async () => {
  await inLots(async (c) => {
    const customerLot = await lots.create(
      { metal_id: 'Platinum', pre_melt: 50, purity: 0.6, unit: 't oz' },
      c
    )
    const refinerLot = await lots.create(
      { metal_id: 'Platinum', pre_melt: 50, purity: 0.6, unit: 't oz' },
      c
    )
    const edge = await lotSources.link(refinerLot.id, customerLot.id, 'batch', c)

    assert.equal(edge.lot_id, refinerLot.id)
    assert.equal(edge.source_lot_id, customerLot.id)
    assert.equal(
      Number(refinerLot.declared_content),
      Number(customerLot.declared_content),
      'the refiner lot did not start from the customer lot content at mint time'
    )
    assert.equal(Number(refinerLot.content), Number(customerLot.content))
  })
})
