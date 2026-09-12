import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aProduct, anUnknownId } from '#shared/testing/builders/index.ts'
import * as lots from '#db/lots/items/repo.ts'

afterAll(async () => {
  await pool.end()
})

const inLots = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inRollback(fn, { actor: TEST_ACTOR.id })

test('a declared lot generates its fine content from its own weights', async () => {
  await inLots(async (c) => {
    const lot = await lots.create(
      { metal_id: 'Gold', pre_melt: 10, purity: 0.9, unit: 't oz', quantity: 1 },
      c
    )
    assert.equal(Number(lot.content), 9)
    assert.equal(lot.bullion_id, null)
    assert.equal(lot.content_snapshot, null)

    const read = await lots.getOne(lot.id, c)
    assert.equal(read?.id, lot.id)
    assert.deepEqual((await lots.getByIds([lot.id], c)).map((l) => l.id), [lot.id])
    assert.deepEqual(await lots.getByIds([], c), [])
    assert.equal(await lots.getOne(anUnknownId(), c), undefined)
  })
})

// The post-melt weight is what a lot is worth once it has been melted, so the
// generated column prefers it over the declared gross.
test('a post-melt weight replaces the declared one in the generated content', async () => {
  await inLots(async (c) => {
    const lot = await lots.create(
      { metal_id: 'Gold', pre_melt: 10, post_melt: 8, purity: 0.5, unit: 't oz' },
      c
    )
    assert.equal(Number(lot.content), 4)

    const edited = await lots.update(lot.id, { purity: 0.25 }, c)
    assert.equal(Number(edited?.content), 2, 'the content did not follow the purity')

    // A patch that names nothing reads the row back rather than writing one.
    assert.equal((await lots.update(lot.id, {}, c))?.id, lot.id)
  })
})

test('a catalogue lot snapshots the product and never re-derives', async () => {
  await inLots(async (c) => {
    const product = await aProduct(c, { gross: 1, content: 1, purity: 0.9167 })
    const lot = await lots.createFromProduct(product.id, 3, false, c)
    assert.ok(lot)
    assert.equal(Number(lot.content_snapshot), Number(product.content))
    assert.equal(
      Number(lot.content),
      Number(product.content),
      'the purity was applied to a fine weight a second time'
    )
    assert.equal(lot.post_melt, null, 'a coin is not melted')
    assert.equal(Number(lot.quantity), 3)

    // Editing the catalogue afterwards moves nothing (ruling 51).
    await c.query('UPDATE products.bullion SET content = 500, purity = 0.5 WHERE id = $1', [
      product.id,
    ])
    assert.equal(Number((await lots.getOne(lot.id, c))?.content), Number(product.content))
  })
})

// `display` gates the BUY side only (ruling 49): a hidden product still reaches
// a sell basket and an admin's order line.
test('a hidden product is refused to a buyer and allowed to a seller', async () => {
  await inLots(async (c) => {
    const hidden = await aProduct(c, { display: false })
    assert.equal(await lots.createFromProduct(hidden.id, 1, true, c), undefined)
    assert.ok(await lots.createFromProduct(hidden.id, 1, false, c))
  })
})

// A split mints children and leaves the parent where it is: the id has to
// survive to the refiner, so nothing is ever rewritten in place.
test('a split mints children carrying split_from_id and leaves the parent alone', async () => {
  await inLots(async (c) => {
    const parent = await lots.create(
      { metal_id: 'Silver', pre_melt: 100, purity: 0.925, unit: 't oz' },
      c
    )
    const children = await lots.splitOff(
      parent.id,
      [
        { pre_melt: 60, purity: 0.925, unit: 't oz', quantity: 1 },
        { pre_melt: 40, purity: 0.925, unit: 't oz', quantity: 1 },
      ],
      c
    )
    assert.equal(children.length, 2)
    for (const child of children) {
      assert.equal(child.split_from_id, parent.id)
      assert.equal(child.metal_id, 'Silver')
      assert.equal(child.content_snapshot, null, 'a scrap child must stay derivable')
    }
    assert.deepEqual(
      children.map((child) => Number(child.content)).sort((a, b) => a - b),
      [37, 55.5]
    )
    assert.equal(
      Number((await lots.getOne(parent.id, c))?.content),
      92.5,
      'the parent was rewritten by its own split'
    )
    assert.deepEqual(await lots.splitOff(parent.id, [], c), [])
  })
})

// `a_snapshot_belongs_to_a_product` was the CHECK that said only a catalogue
// lot has a fixed content. 161 gives a SETTLED scrap lot one too - the fine
// weight its payout was computed from - and a CHECK cannot see whether a lot's
// order has been finalized, so 173 drops it. The half that is still true is
// that no LIVE path writes a scrap lot's snapshot, and these are the three
// places one could come from.
test('no live path can snapshot a scrap lot', async () => {
  await inLots(async (c) => {
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 10, purity: 0.9 }, c)
    assert.equal(lot.content_snapshot, null, 'create.sql set one')

    await assert.rejects(
      lots.update(lot.id, { content_snapshot: 9 } as never, c),
      /content_snapshot/,
      'LotPatch let a snapshot through'
    )

    const [child] = await lots.splitOff(lot.id, [{ pre_melt: 10, purity: 0.9 }], c)
    assert.equal(child?.content_snapshot, null, 'split.sql inherited one')
  })
})

test('a lot with no link is deletable, and an unknown one is not', async () => {
  await inLots(async (c) => {
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 1, purity: 1 }, c)
    assert.equal(await lots.remove(lot.id, c), true)
    assert.equal(await lots.remove(lot.id, c), false)
  })
})
