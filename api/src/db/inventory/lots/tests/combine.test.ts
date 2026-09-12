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

test('combine conserves content exactly across three lots of different purities', async () => {
  await inLots(async (c) => {
    const a = await lots.create({ metal_id: 'Gold', unit: 't oz', pre_melt: 10, purity: 0.9 }, c)
    const b = await lots.create({ metal_id: 'Gold', unit: 't oz', pre_melt: 20, purity: 0.5 }, c)
    const cc = await lots.create({ metal_id: 'Gold', unit: 't oz', pre_melt: 15, purity: 0.75 }, c)

    const expected = Number(a.content) + Number(b.content) + Number(cc.content)

    const combined = await lots.combine([a.id, b.id, cc.id], c)
    await lots.linkCombined([a.id, b.id, cc.id], combined.id, c)

    assert.equal(combined.metal_id, 'Gold')
    assert.equal(combined.unit, 't oz')
    assert.ok(
      Math.abs(Number(combined.content) - expected) < 1e-6,
      `expected ${expected}, got ${combined.content}`
    )

    const edges = await lotSources.getFor(combined.id, c)
    assert.equal(edges.length, 3)
    assert.ok(edges.every((edge) => edge.kind === 'combine'))
    assert.deepEqual(
      edges.map((edge) => edge.source_lot_id).sort(),
      [a.id, b.id, cc.id].sort()
    )
  })
})

test('combine conserves content when some parents are assayed and others are not', async () => {
  await inLots(async (c) => {
    const assayed = await lots.create(
      { metal_id: 'Silver', unit: 't oz', pre_melt: 100, post_melt: 92, purity: 0.925 },
      c
    )
    const declaredOnly = await lots.create(
      { metal_id: 'Silver', unit: 't oz', pre_melt: 50, purity: 0.6 },
      c
    )

    const expected = Number(assayed.content) + Number(declaredOnly.content)

    const combined = await lots.combine([assayed.id, declaredOnly.id], c)
    assert.ok(
      Math.abs(Number(combined.content) - expected) < 1e-6,
      `expected ${expected}, got ${combined.content}`
    )
  })
})

test('combine of same-bullion lots merges quantity and keeps the shared per-unit content', async () => {
  await inLots(async (c) => {
    const { aProduct } = await import('#shared/testing/builders/index.ts')
    const product = await aProduct(c, { gross: 1, content: 1, purity: 0.9167 })
    const one = await lots.createFromProduct(product.id, 2, false, c)
    const two = await lots.createFromProduct(product.id, 3, false, c)
    assert.ok(one && two)

    const combined = await lots.combine([one!.id, two!.id], c)
    assert.equal(combined.bullion_id, product.id)
    assert.equal(Number(combined.quantity), 5)
    assert.equal(Number(combined.content), Number(product.content))
  })
})
