// GET /api/leads - THE LEADS LIST, PAGED AND SORTED IN SQL.
//
// The list answers { rows, total }: `total` is every lead the filters match,
// `rows` one page of them. Filters: stage, assigned_to, source_id, q,
// archived, created_from / created_to (UTC dates, from inclusive, to
// exclusive). `sort` is name, estimated_value or created, `direction` asc or
// desc (default created desc); `page` and `page_size` page it. The status chip
// Contacted lists a lead contacted or responded and not converted.
//
// Estimated value is priced by the pricing domain; the list orders by its
// ranking and a lead with no estimate items sorts last either way.
//
// GET /api/leads/export takes the same filters and answers the matching leads
// as CSV, built in SQL. POST /api/leads/assign gives the selected leads one
// owner in one transaction.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LeadPage, LeadView } from '@dorado/contracts'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, aTag, anEstimateItem, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLeads = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id })

async function list(query: Record<string, string | number>): Promise<LeadPage> {
  return await asAdmin(TEST_ACTOR, async () => {
    const res = await request(app).get('/api/leads').query(query)
    assert.equal(res.status, 200, res.text)
    return LeadPage.parse(res.body)
  })
}

const names = (page: LeadPage) => page.rows.map((row) => row.name)

async function created(c: PoolClient, id: string, at: string): Promise<void> {
  await c.query('UPDATE leads.leads SET created_at = $2::timestamptz WHERE id = $1', [id, at])
}

async function twoSources(c: PoolClient): Promise<[string, string]> {
  const { rows } = await c.query<{ id: string }>(
    'SELECT id FROM leads.sources ORDER BY sort_order, key LIMIT 2'
  )
  return [rows[0]!.id, rows[1]!.id]
}

test('the list answers rows and the total the filters match, one page at a time', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    for (const n of ['a', 'b', 'c', 'd', 'e']) await aLead(c, { name: `${tag} ${n}` })

    const first = await list({ q: tag, page: 1, page_size: 2, sort: 'name', direction: 'asc' })
    assert.equal(first.total, 5)
    assert.deepEqual(names(first), [`${tag} a`, `${tag} b`])

    const third = await list({ q: tag, page: 3, page_size: 2, sort: 'name', direction: 'asc' })
    assert.equal(third.total, 5)
    assert.deepEqual(names(third), [`${tag} e`])

    const all = await list({ q: tag })
    assert.equal(all.rows.length, 5, 'with no page_size the list answers every match')
    for (const row of all.rows) LeadView.parse(row)
  })
})

test('sort by name both ways, and created newest first by default', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    const b = await aLead(c, { name: `${tag} bravo` })
    const a = await aLead(c, { name: `${tag} alpha` })
    const z = await aLead(c, { name: `${tag} zulu` })
    await created(c, b.id, '2020-01-03T00:00:00Z')
    await created(c, a.id, '2020-01-01T00:00:00Z')
    await created(c, z.id, '2020-01-02T00:00:00Z')

    assert.deepEqual(names(await list({ q: tag, sort: 'name', direction: 'desc' })), [
      `${tag} zulu`,
      `${tag} bravo`,
      `${tag} alpha`,
    ])
    assert.deepEqual(names(await list({ q: tag })), [`${tag} bravo`, `${tag} zulu`, `${tag} alpha`])
    assert.deepEqual(names(await list({ q: tag, sort: 'created', direction: 'asc' })), [
      `${tag} alpha`,
      `${tag} zulu`,
      `${tag} bravo`,
    ])
  })
})

test('sort by estimated value follows the pricing total, and an empty estimate sorts last', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    const small = await aLead(c, { name: `${tag} small` })
    const big = await aLead(c, { name: `${tag} big` })
    const middle = await aLead(c, { name: `${tag} middle` })
    await aLead(c, { name: `${tag} empty` })
    await anEstimateItem(c, small.id, { metal_id: 'Gold', weight: 1 })
    await anEstimateItem(c, big.id, { metal_id: 'Gold', weight: 9 })
    await anEstimateItem(c, middle.id, { metal_id: 'Gold', weight: 4 })

    assert.deepEqual(names(await list({ q: tag, sort: 'estimated_value', direction: 'desc' })), [
      `${tag} big`,
      `${tag} middle`,
      `${tag} small`,
      `${tag} empty`,
    ])
    const asc = await list({ q: tag, sort: 'estimated_value', direction: 'asc', page_size: 3 })
    assert.equal(asc.total, 4)
    assert.deepEqual(names(asc), [`${tag} small`, `${tag} middle`, `${tag} big`])
  })
})

test('the created window narrows the list and its total', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    const early = await aLead(c, { name: `${tag} early` })
    const inside = await aLead(c, { name: `${tag} inside` })
    const late = await aLead(c, { name: `${tag} late` })
    await created(c, early.id, '2001-01-31T23:00:00Z')
    await created(c, inside.id, '2001-02-10T10:00:00Z')
    await created(c, late.id, '2001-03-01T00:00:00Z')

    const page = await list({ q: tag, created_from: '2001-02-01', created_to: '2001-03-01' })
    assert.equal(page.total, 1)
    assert.deepEqual(names(page), [`${tag} inside`])
  })
})

test('source_id filters to one source', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    const [one, two] = await twoSources(c)
    await aLead(c, { name: `${tag} one`, source_id: one })
    await aLead(c, { name: `${tag} two`, source_id: two })
    assert.deepEqual(names(await list({ q: tag, source_id: one })), [`${tag} one`])
  })
})

test('the Contacted chip lists a contacted or responded lead that is not converted', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    const contacted = await aLead(c, { name: `${tag} contacted` })
    const responded = await aLead(c, { name: `${tag} responded` })
    const converted = await aLead(c, { name: `${tag} converted` })
    await aLead(c, { name: `${tag} new` })
    await c.query('UPDATE leads.leads SET contacted_at = now() WHERE id = $1', [contacted.id])
    await c.query(
      'UPDATE leads.leads SET contacted_at = now(), responded_at = now() WHERE id = $1',
      [responded.id]
    )
    await c.query(
      'UPDATE leads.leads SET contacted_at = now(), converted_at = now() WHERE id = $1',
      [converted.id]
    )
    const page = await list({ q: tag, stage: 'Contacted', sort: 'name', direction: 'asc' })
    assert.deepEqual(names(page), [`${tag} contacted`, `${tag} responded`])
  })
})

test('a malformed sort, direction, page or source is refused with 400', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      for (const query of [
        { sort: 'price' },
        { direction: 'up' },
        { page: '0' },
        { page_size: 'many' },
        { source_id: 'website' },
        { created_from: 'soon' },
      ]) {
        const res = await request(app).get('/api/leads').query(query)
        assert.equal(res.status, 400, `${JSON.stringify(query)} answered ${res.status}`)
      }
    })
  })
})

test('export answers the matching leads as a CSV attachment, header first', async () => {
  await inLeads(async (c) => {
    const tag = aTag()
    await aLead(c, { name: `${tag} "quoted", name`, phone: '5125550199' })
    await aLead(c, { name: `${tag} plain` })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .get('/api/leads/export')
        .query({ q: tag, sort: 'name', direction: 'asc' })
      assert.equal(res.status, 200, res.text)
      assert.match(String(res.headers['content-type']), /^text\/csv/)
      assert.match(String(res.headers['content-disposition']), /^attachment; filename="leads.csv"$/)
      const lines = res.text.trim().split('\n')
      assert.equal(lines[0], 'number,name,phone,email,source,status,assigned_to,created_at')
      assert.equal(lines.length, 3)
      assert.ok(lines[1]!.includes(`"${tag} ""quoted"", name"`), lines[1])
      assert.ok(lines[1]!.includes('5125550199'))
      assert.ok(lines[2]!.includes(`${tag} plain`))
    })
  })
})

test('assign gives every selected lead one owner and records each assignment', async () => {
  await inLeads(async (c) => {
    const one = await aLead(c)
    const two = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/leads/assign')
        .send({ lead_ids: [one.id, two.id], assigned_to_id: TEST_ACTOR.id })
      assert.equal(res.status, 200, res.text)
      const rows = res.body.map((row: unknown) => LeadView.parse(row))
      assert.deepEqual(rows.map((row: LeadView) => row.assigned_to_id).sort(), [
        TEST_ACTOR.id,
        TEST_ACTOR.id,
      ])
    })
    const { rows } = await c.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM crm.assignments WHERE lead_id = ANY($1::uuid[])',
      [[one.id, two.id]]
    )
    assert.equal(rows[0]!.n, 2)
  })
})

test('assign is all or nothing: an unknown lead leaves the others unassigned', async () => {
  await inLeads(async (c) => {
    const one = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/leads/assign')
        .send({ lead_ids: [one.id, anUnknownId()], assigned_to_id: TEST_ACTOR.id })
      assert.equal(res.status, 404, res.text)
    })
    const { rows } = await c.query<{ assigned_to_id: string | null }>(
      'SELECT assigned_to_id FROM leads.leads WHERE id = $1',
      [one.id]
    )
    assert.equal(rows[0]!.assigned_to_id, null)
  })
})

test('assign takes a strict body, and a customer reaches neither assign nor export', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const empty = await request(app)
        .post('/api/leads/assign')
        .send({ lead_ids: [], assigned_to_id: TEST_ACTOR.id })
      assert.equal(empty.status, 400, empty.text)
      const extra = await request(app)
        .post('/api/leads/assign')
        .send({ lead_ids: [anUnknownId()], assigned_to_id: null, note: 'x' })
      assert.equal(extra.status, 400, extra.text)
    })
    await as({ ...TEST_CUSTOMER, role: 'user' }, async () => {
      assert.equal((await request(app).get('/api/leads/export')).status, 403)
      assert.equal(
        (await request(app).post('/api/leads/assign').send({ lead_ids: [], assigned_to_id: null }))
          .status,
        403
      )
    })
  })
})

test('PATCH takes notes', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .patch(`/api/leads/${lead.id}`)
        .send({ notes: 'Call after 5pm' })
      assert.equal(res.status, 200, res.text)
      assert.equal(LeadView.parse(res.body).notes, 'Call after 5pm')
    })
  })
})

test('create refuses a phone a live lead already holds, and takes notes', async () => {
  await inLeads(async (c) => {
    const phone = `512556${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    await aLead(c, { phone })
    await asAdmin(TEST_ACTOR, async () => {
      const taken = await request(app).post('/api/leads').send({ name: 'Twin', phone })
      assert.equal(taken.status, 409, taken.text)
      assert.match(taken.text, /A lead with this phone number already exists\./)
      const made = await request(app)
        .post('/api/leads')
        .send({ name: 'Fresh', phone: `${phone}9`, notes: 'Call after 5pm' })
      assert.equal(made.status, 201, made.text)
      assert.equal(LeadView.parse(made.body).notes, 'Call after 5pm')
    })
  })
})
