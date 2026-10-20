// Two creates for one phone at the same moment yield one lead: the create
// transaction takes pg_advisory_xact_lock(hashtext(phone)) before it looks
// for a live lead holding the number. These two run on their own connections
// and commit, so the test removes the lead it made.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import query from '#shared/db/query.ts'
import * as service from '#crm/leads/service.ts'

afterAll(async () => {
  await pool.end()
})

test('two concurrent creates with one phone make one lead and refuse the other', async () => {
  const phone = `512559${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
  const results = await Promise.allSettled([
    service.create({ name: 'Race A', phone }),
    service.create({ name: 'Race B', phone }),
  ])
  try {
    const made = results.filter((r) => r.status === 'fulfilled')
    const refused = results.filter((r) => r.status === 'rejected')
    assert.equal(made.length, 1, 'both creates went through')
    assert.equal(refused.length, 1)
    assert.match(
      String((refused[0] as PromiseRejectedResult).reason),
      /phone number already exists/
    )
    const { rows } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM leads.leads WHERE phone = $1',
      [phone]
    )
    assert.equal(rows[0]!.n, 1)
  } finally {
    await query('DELETE FROM leads.leads WHERE phone = $1', [phone])
  }
})
