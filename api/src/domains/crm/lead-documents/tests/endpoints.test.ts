import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, anUnknownId } from '#shared/testing/builders/index.ts'
import { MAX_DOCUMENTS_PER_LEAD } from '#crm/lead-documents/rules.ts'

await mockSessions()
const { default: app } = await import('#app')

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as(
    { id: TEST_CUSTOMER.id, name: TEST_CUSTOMER.name, email: TEST_CUSTOMER.email, role: 'user' },
    fn
  )

const BOUNDARY = 'DORADO-LEAD-DOC-BOUNDARY'

const multipart = (filename: string, body: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
  `Content-Type: application/pdf\r\n\r\n${body}\r\n--${BOUNDARY}--\r\n`

const upload = (lead_id: string, n: number) =>
  request(app)
    .post(`/api/leads/${lead_id}/documents`)
    .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
    .send(multipart(`lead-${n}.pdf`, `%PDF-1.7 lead document ${n}`))

test('a customer cannot reach any lead document route', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asCustomer(async () => {
        assert.equal((await request(app).get(`/api/leads/${lead.id}/documents`)).status, 403)
        assert.equal((await upload(lead.id, 1)).status, 403)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an upload writes a pdf row, links it, and the list serves it back', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)

      await asAdmin(async () => {
        const made = await upload(lead.id, 1)
        assert.equal(made.status, 201, JSON.stringify(made.body))
        assert.equal(made.body.lead_id, lead.id)
        assert.equal(made.body.kind, 'lead_document')
        assert.ok(made.body.pdf_id, 'no pdf id came back')
        assert.ok(made.body.size_bytes > 0)

        const listed = await request(app).get(`/api/leads/${lead.id}/documents`)
        assert.equal(listed.status, 200)
        assert.deepEqual(
          listed.body.map((row: { pdf_id: string }) => row.pdf_id),
          [made.body.pdf_id]
        )
      })

      const { rows } = await c.query(
        `SELECT kind FROM leads.documents d
         JOIN media.pdfs p ON p.id = d.pdf_id WHERE d.lead_id = $1`,
        [lead.id]
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0]?.kind, 'lead_document')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a request with no file is refused', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asAdmin(async () => {
        const bad = await request(app)
          .post(`/api/leads/${lead.id}/documents`)
          .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
          .send(`--${BOUNDARY}--\r\n`)
        assert.equal(bad.status, 422, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the fourth document is refused and the first three survive', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)

      await asAdmin(async () => {
        for (let n = 1; n <= MAX_DOCUMENTS_PER_LEAD; n += 1) {
          assert.equal((await upload(lead.id, n)).status, 201, `upload ${n} failed`)
        }
        const refused = await upload(lead.id, MAX_DOCUMENTS_PER_LEAD + 1)
        assert.equal(refused.status, 422, JSON.stringify(refused.body))

        const listed = await request(app).get(`/api/leads/${lead.id}/documents`)
        assert.equal(listed.body.length, MAX_DOCUMENTS_PER_LEAD)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('DELETE unlinks and leaves the pdf row where it is', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      let pdf_id = ''

      await asAdmin(async () => {
        pdf_id = (await upload(lead.id, 1)).body.pdf_id
        const gone = await request(app).delete(`/api/leads/${lead.id}/documents/${pdf_id}`)
        assert.equal(gone.status, 200)
        assert.deepEqual(gone.body, [])
      })

      const { rows } = await c.query(`SELECT 1 FROM media.pdfs WHERE id = $1`, [pdf_id])
      assert.equal(rows.length, 1, 'the append-only pdf row was deleted with the link')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('deleting a link the lead never held is 404', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asAdmin(async () => {
        const res = await request(app).delete(`/api/leads/${lead.id}/documents/${anUnknownId()}`)
        assert.equal(res.status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an id that names no lead is 404 on the list and on the upload', async () => {
  await inPinnedTransaction(
    async () => {
      const absent = anUnknownId()
      await asAdmin(async () => {
        assert.equal((await request(app).get(`/api/leads/${absent}/documents`)).status, 404)
        assert.equal((await upload(absent, 1)).status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
