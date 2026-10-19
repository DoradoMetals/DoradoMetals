// RULING 162: an archived lead leaves every funnel count. Read as a delta
// inside one REPEATABLE READ snapshot, as repo.test.ts beside this file does,
// so a lead committed elsewhere between the two reads cannot move the number.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR, actingAs } from '#shared/testing/actor.ts'
import { aLead } from '#shared/testing/builders/index.ts'
import * as funnel from '#db/leads/funnel/repo.ts'

afterAll(async () => {
  await pool.end()
})

async function inSnapshot<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  try {
    await actingAs(c, TEST_ACTOR.id)
    return await fn(c)
  } finally {
    await c.query('ROLLBACK')
    c.release()
  }
}

let phones = 0
const aPhone = (): string => `512556${String(3000 + (phones += 1)).padStart(4, '0')}`

test('archiving an open, unowned, untouched lead takes it out of every funnel count', async () => {
  await inSnapshot(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    const before = await funnel.get(c)

    await c.query('UPDATE leads.leads SET archived_at = now() WHERE id = $1', [lead.id])
    const after = await funnel.get(c)

    assert.equal(after.open, before.open - 1, 'an archived lead still counts as open')
    assert.equal(after.unassigned, before.unassigned - 1)
    assert.equal(after.never_contacted, before.never_contacted - 1)
    assert.equal(after.both, before.both - 1)
  })
})

test('archiving a converted lead lowers the conversion rate it had raised', async () => {
  await inSnapshot(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    await c.query('UPDATE leads.leads SET converted_at = now() WHERE id = $1', [lead.id])
    const counted = await funnel.get(c)

    await c.query('UPDATE leads.leads SET archived_at = now() WHERE id = $1', [lead.id])
    const archived = await funnel.get(c)

    assert.ok(
      archived.conversion_rate < counted.conversion_rate,
      'an archived converted lead still counts toward the conversion rate'
    )
  })
})
