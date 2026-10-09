import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as purityLabels from '#db/metals/purity-labels/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('every purity label is readable, in metal then purity order', async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await purityLabels.list(c)
    assert.ok(rows.length > 0, 'metals.purity_labels holds rows and the repo returned none')
    assert.equal(rows[0]?.metal_id, 'Gold', 'the list is not in metals.metals.sort_order')
    for (const row of rows) {
      assert.ok(row.label, 'a purity label carries no label')
      assert.ok(Number(row.purity) > 0, `${row.label} carries no purity`)
    }
  })
})
