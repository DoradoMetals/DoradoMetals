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

const inLotSources = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inRollback(fn, { actor: TEST_ACTOR.id })

const aLot = (c: PoolClient, metal_id = 'Gold') =>
  lots.create({ metal_id, pre_melt: 10, purity: 0.9 }, c)

test('link writes one edge, and getFor reads it back by the derived side', async () => {
  await inLotSources(async (c) => {
    const parent = await aLot(c)
    const child = await aLot(c)

    const edge = await lotSources.link(child.id, parent.id, 'split', c)
    assert.equal(edge.lot_id, child.id)
    assert.equal(edge.source_lot_id, parent.id)
    assert.equal(edge.kind, 'split')

    const forChild = await lotSources.getFor(child.id, c)
    assert.equal(forChild.length, 1)
    assert.equal(forChild[0]?.id, edge.id)

    assert.deepEqual(await lotSources.getFor(parent.id, c), [])
  })
})

test('sourcesOf reads edges by the source side, batched', async () => {
  await inLotSources(async (c) => {
    const parentA = await aLot(c)
    const parentB = await aLot(c)
    const result = await aLot(c)

    await lotSources.link(result.id, parentA.id, 'combine', c)
    await lotSources.link(result.id, parentB.id, 'combine', c)

    const rows = await lotSources.sourcesOf([parentA.id, parentB.id], c)
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((row) => row.source_lot_id).sort(),
      [parentA.id, parentB.id].sort()
    )
    assert.ok(rows.every((row) => row.lot_id === result.id && row.kind === 'combine'))

    assert.deepEqual(await lotSources.sourcesOf([], c), [])
  })
})

test('linkMany writes every triple in one statement', async () => {
  await inLotSources(async (c) => {
    const parent = await aLot(c)
    const childA = await aLot(c)
    const childB = await aLot(c)

    const rows = await lotSources.linkMany(
      [childA.id, childB.id],
      [parent.id, parent.id],
      ['split', 'split'],
      c
    )
    assert.equal(rows.length, 2)

    const forParent = await lotSources.sourcesOf([parent.id], c)
    assert.equal(forParent.length, 2)

    assert.deepEqual(await lotSources.linkMany([], [], [], c), [])
  })
})

test('remove deletes one edge by id', async () => {
  await inLotSources(async (c) => {
    const parent = await aLot(c)
    const child = await aLot(c)
    const edge = await lotSources.link(child.id, parent.id, 'split', c)

    assert.equal(await lotSources.remove(edge.id, c), true)
    assert.equal(await lotSources.remove(edge.id, c), false)
    assert.deepEqual(await lotSources.getFor(child.id, c), [])
  })
})

test('repoint collapses every edge of one kind on the derived lot into one from the new source', async () => {
  await inLotSources(async (c) => {
    const refinerLot = await aLot(c)
    const customerA = await aLot(c)
    const customerB = await aLot(c)
    const combined = await aLot(c)

    await lotSources.link(refinerLot.id, customerA.id, 'batch', c)
    await lotSources.link(refinerLot.id, customerB.id, 'batch', c)
    assert.equal((await lotSources.getFor(refinerLot.id, c)).length, 2)

    const repointed = await lotSources.repoint(refinerLot.id, combined.id, 'batch', c)
    assert.equal(repointed.lot_id, refinerLot.id)
    assert.equal(repointed.source_lot_id, combined.id)

    const after = await lotSources.getFor(refinerLot.id, c)
    assert.equal(after.length, 1)
    assert.equal(after[0]?.source_lot_id, combined.id)
  })
})
