// RULING 162: A LEAD IS NEVER HARD-DELETED; DELETE ARCHIVES IT.
//
// DELETE /api/leads/:id stamps leads.leads.archived_at and the row stays.
// GET /api/leads hides an archived lead unless `archived=true` is asked for,
// which answers the archived leads only (the Archived status chip).
// POST /api/leads/:id/restore clears the stamp. No application statement
// deletes a lead row: the last test reads every SQL and TypeScript file
// under api/src (tests excluded) and refuses one that does.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LeadView } from '@dorado/contracts'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aLead, aTag, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLeads = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id })

const asCustomer = <T>(fn: () => Promise<T> | T) => as({ ...TEST_CUSTOMER, role: 'user' }, fn)

async function rowCount(c: PoolClient, id: string): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM leads.leads WHERE id = $1',
    [id]
  )
  return rows[0]!.n
}

async function archivedAt(c: PoolClient, id: string): Promise<string | null> {
  const { rows } = await c.query<{ archived_at: string | null }>(
    'SELECT archived_at FROM leads.leads WHERE id = $1',
    [id]
  )
  return rows[0]?.archived_at ?? null
}

test('DELETE archives the lead: archived_at is set and the row is still there', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const totalBefore = (await c.query('SELECT count(*)::int AS n FROM leads.leads')).rows[0].n

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).delete(`/api/leads/${lead.id}`)
      assert.equal(res.status, 200, res.text)
    })

    assert.equal(await rowCount(c, lead.id), 1, 'DELETE removed the lead row')
    assert.ok(await archivedAt(c, lead.id), 'DELETE did not stamp archived_at')
    const totalAfter = (await c.query('SELECT count(*)::int AS n FROM leads.leads')).rows[0].n
    assert.equal(totalAfter, totalBefore, 'the number of lead rows changed on archive')
  })
})

test('an archived lead is still readable by id, and its read carries archived_at', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      await request(app).delete(`/api/leads/${lead.id}`)
      const one = await request(app).get(`/api/leads/${lead.id}`)
      assert.equal(one.status, 200, one.text)
      const parsed = LeadView.parse(one.body)
      assert.ok(parsed.archived_at, 'the read of an archived lead has no archived_at')
    })
  })
})

test('a fresh lead reads archived_at null', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      const one = await request(app).get(`/api/leads/${lead.id}`)
      assert.equal(one.status, 200, one.text)
      assert.equal(LeadView.parse(one.body).archived_at, null)
    })
  })
})

test('the list hides an archived lead by default and shows it with archived=true', async () => {
  await inLeads(async (c) => {
    const tag = `archive-${aTag()}`
    const kept = await aLead(c, { name: `${tag}-kept` })
    const gone = await aLead(c, { name: `${tag}-gone` })

    await asAdmin(TEST_ACTOR, async () => {
      assert.equal((await request(app).delete(`/api/leads/${gone.id}`)).status, 200)

      const plain = await request(app).get('/api/leads').query({ q: tag })
      assert.equal(plain.status, 200, plain.text)
      const plainIds = plain.body.map((l: { id: string }) => l.id)
      assert.ok(plainIds.includes(kept.id), 'the live lead left the default list')
      assert.ok(!plainIds.includes(gone.id), 'the archived lead is in the default list')

      const off = await request(app).get('/api/leads').query({ q: tag, archived: 'false' })
      assert.equal(off.status, 200, off.text)
      assert.ok(!off.body.some((l: { id: string }) => l.id === gone.id))

      const archived = await request(app).get('/api/leads').query({ q: tag, archived: 'true' })
      assert.equal(archived.status, 200, archived.text)
      const archivedIds = archived.body.map((l: { id: string }) => l.id)
      assert.ok(archivedIds.includes(gone.id), 'archived=true did not show the archived lead')
      assert.ok(!archivedIds.includes(kept.id), 'archived=true showed a live lead')
      for (const row of archived.body) {
        assert.ok(LeadView.parse(row).archived_at, 'archived=true answered a live lead')
      }
    })
  })
})

test('a value for archived other than true or false is refused with 400', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads').query({ archived: 'maybe' })
      assert.equal(res.status, 400, res.text)
    })
  })
})

test('POST /:id/restore clears archived_at and puts the lead back in the default list', async () => {
  await inLeads(async (c) => {
    const tag = `restore-${aTag()}`
    const lead = await aLead(c, { name: `${tag}-lead` })

    await asAdmin(TEST_ACTOR, async () => {
      await request(app).delete(`/api/leads/${lead.id}`)
      assert.ok(await archivedAt(c, lead.id))

      const restored = await request(app).post(`/api/leads/${lead.id}/restore`).send({})
      assert.equal(restored.status, 200, restored.text)
      assert.equal(LeadView.parse(restored.body).archived_at, null)
      assert.equal(restored.body.id, lead.id)

      assert.equal(await archivedAt(c, lead.id), null, 'restore left archived_at set')
      const listed = await request(app).get('/api/leads').query({ q: tag })
      assert.ok(
        listed.body.some((l: { id: string }) => l.id === lead.id),
        'the restored lead is not back in the default list'
      )
    })
  })
})

test('DELETE on an archived lead, and restore on an unknown id, are 404', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    await asAdmin(TEST_ACTOR, async () => {
      assert.equal((await request(app).delete(`/api/leads/${lead.id}`)).status, 200)
      const twice = await request(app).delete(`/api/leads/${lead.id}`)
      assert.equal(twice.status, 404, twice.text)

      const unknown = await request(app).post(`/api/leads/${anUnknownId()}/restore`).send({})
      assert.equal(unknown.status, 404, unknown.text)
    })
    assert.equal(await rowCount(c, lead.id), 1, 'a second DELETE removed the row')
  })
})

test('restore is admin-only and its body is strict', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    await asCustomer(async () => {
      const res = await request(app).post(`/api/leads/${lead.id}/restore`).send({})
      assert.equal(res.status, 403, res.text)
    })
    await asAdmin(TEST_ACTOR, async () => {
      await request(app).delete(`/api/leads/${lead.id}`)
      const loose = await request(app)
        .post(`/api/leads/${lead.id}/restore`)
        .send({ archived_at: null })
      assert.equal(loose.status, 400, loose.text)
    })
  })
})

// --- no application statement deletes a lead row ---------------------------

const SRC = path.resolve(import.meta.dirname, '..', '..', '..', '..')

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'tests' || entry === 'node_modules') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.(sql|ts)$/.test(entry)) out.push(full)
  }
  return out
}

test('no application file under api/src issues DELETE FROM leads.leads', () => {
  const offenders = sources(SRC).filter((file) =>
    /DELETE\s+FROM\s+leads\.leads\b/i.test(readFileSync(file, 'utf8'))
  )
  assert.deepEqual(
    offenders.map((f) => path.relative(SRC, f)),
    [],
    'ruling 162: a lead row is archived, never deleted'
  )
})

test('restore on a live lead is a 409 and leaves the row untouched', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const before = (await c.query('SELECT updated_at FROM leads.leads WHERE id = $1', [lead.id]))
      .rows[0].updated_at
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post(`/api/leads/${lead.id}/restore`).send({})
      assert.equal(res.status, 409, res.text)
      assert.match(res.text, /not archived/)
    })
    const after = (await c.query('SELECT updated_at FROM leads.leads WHERE id = $1', [lead.id]))
      .rows[0].updated_at
    assert.deepEqual(after, before, 'a refused restore bumped updated_at')
    assert.equal(await archivedAt(c, lead.id), null)
  })
})

test('converting an archived lead is a 409', async () => {
  await inPinnedTransaction(
    async (c) => {
      const lead = await aLead(c)
      await asAdmin(TEST_ACTOR, async () => {
        assert.equal((await request(app).delete(`/api/leads/${lead.id}`)).status, 200)
        const res = await request(app).post(`/api/leads/${lead.id}/convert`).send({})
        assert.equal(res.status, 409, res.text)
        assert.match(res.text, /archived/)
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] }
  )
})

test('DELETE with an id that is not a uuid is a 400', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).delete('/api/leads/not-a-uuid')
      assert.equal(res.status, 400, res.text)
    })
  })
})
