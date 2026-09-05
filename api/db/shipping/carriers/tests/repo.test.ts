import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as carriers from '#db/shipping/carriers/repo.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

async function anOrganization(c: PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO organizations.organizations (type, name, enabled)
     VALUES ('CARRIER', 'Test Carrier Co', true) RETURNING id`
  )
  return rows[0]!.id
}

test('update writes logo on a real carrier', async () => {
  await inRollback(async (c: PoolClient) => {
    const organization_id = await anOrganization(c)
    const row = await carriers.create({ organization_id, logo: null }, c)

    const changed = await carriers.update(row.id, { logo: 'https://example.com/logo.png' }, c)
    assert.equal(changed, true, 'update reported no row changed')

    const after = await carriers.getOne(row.id, c)
    assert.equal(after?.logo, 'https://example.com/logo.png')
  })
})

test('update answers false for an id with no carrier row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await carriers.update(randomUUID(), { logo: 'x' }, c)
    assert.equal(changed, false, 'update reported a change for a carrier that does not exist')
  })
})

test('remove deletes a real carrier and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const organization_id = await anOrganization(c)
    const row = await carriers.create({ organization_id, logo: null }, c)

    const removed = await carriers.remove(row.id, c)
    assert.equal(removed, true, 'remove reported no row changed')
    assert.equal(await carriers.getOne(row.id, c), undefined)

    const removedAgain = await carriers.remove(row.id, c)
    assert.equal(removedAgain, false, 'remove reported a change for a carrier already gone')
  })
})

test('getAll answers every carrier row, this one included', async () => {
  await inRollback(async (c: PoolClient) => {
    const organization_id = await anOrganization(c)
    const row = await carriers.create({ organization_id, logo: 'https://example.com/a.png' }, c)

    const rows = await carriers.getAll(c)
    const found = rows.find((r) => r.id === row.id)
    assert.ok(found, 'getAll did not answer the carrier just created')
    assert.equal(found.logo, 'https://example.com/a.png')
  })
})
