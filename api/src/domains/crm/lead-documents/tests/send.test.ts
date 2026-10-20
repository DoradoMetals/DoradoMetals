// A LEAD'S DOCUMENTS: THEIR NAMES, A SIGNED DOWNLOAD URL, AND SEND.
//
//   GET  /api/leads/:id/documents                    each row carries its canonical `name`
//   GET  /api/leads/:id/documents/:pdfId/url         200, a signed download URL (a string)
//   POST /api/leads/:id/documents/:pdfId/send        200, { channel: 'sms' | 'email' }
//
// Send goes by the lead's contact preference: Text sends an SMS with the
// signed link, Email sends the PDF as an attachment, and a lead with no
// preference (or Call) is texted when it has a phone, emailed otherwise. The
// providers are the fakes; nothing leaves the process.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { LeadDocumentSent, LeadDocumentView } from '@dorado/contracts'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, anUnknownId, contactPreferenceId } from '#shared/testing/builders/index.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import * as service from '#crm/lead-documents/service.ts'
import { LOCKS } from '#shared/testing/locks.ts'

await mockSessions()
const { default: app } = await import('#app')

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)

const BOUNDARY = 'DORADO-LEAD-DOC-SEND'

const upload = (lead_id: string, body = `%PDF-1.7 send ${Math.random()}`) =>
  request(app)
    .post(`/api/leads/${lead_id}/documents`)
    .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
    .send(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="q.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n${body}\r\n--${BOUNDARY}--\r\n`
    )

const SEND_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS]

const aPhone = () => `512557${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`

test('the list names each document and the url read signs a download link', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asAdmin(async () => {
        const made = await upload(lead.id)
        assert.equal(made.status, 201, made.text)
        const listed = await request(app).get(`/api/leads/${lead.id}/documents`)
        const row = LeadDocumentView.parse(listed.body[0])
        assert.equal(row.name, 'Lead Document')

        const url = await request(app).get(`/api/leads/${lead.id}/documents/${row.pdf_id}/url`)
        assert.equal(url.status, 200, url.text)
        assert.equal(typeof url.body, 'string')
        assert.ok(url.body.includes(row.path), `the signed url ${url.body} does not name the pdf`)

        const missing = await request(app).get(
          `/api/leads/${lead.id}/documents/${anUnknownId()}/url`
        )
        assert.equal(missing.status, 404, missing.text)
      })
    },
    { actor: TEST_ACTOR.id, lock: SEND_LOCKS }
  )
})

test('send texts the signed link to a lead who prefers Text', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone = aPhone()
      const lead = await aLead(c, {
        phone,
        contact_preference_id: await contactPreferenceId(c, 'text'),
      })
      await asAdmin(async () => {
        const made = await upload(lead.id)
        const res = await request(app)
          .post(`/api/leads/${lead.id}/documents/${made.body.pdf_id}/send`)
          .send({})
        assert.equal(res.status, 200, res.text)
        assert.deepEqual(LeadDocumentSent.parse(res.body), { channel: 'sms' })
        const text = fakeSms.lastMessageTo(phone)
        assert.ok(text, 'no text reached the fake')
        assert.match(text.body, /Lead Document/)
        assert.ok(text.body.includes(made.body.path), 'the text carries no link to the pdf')
      })
    },
    { actor: TEST_ACTOR.id, lock: SEND_LOCKS }
  )
})

test('send emails the PDF as an attachment to a lead who prefers Email', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c, { contact_preference_id: await contactPreferenceId(c, 'email') })
      const body = `%PDF-1.7 stored ${Math.random()}`
      const made = await asAdmin(async () => await upload(lead.id, body))
      const sent = await service.send(lead.id, made.body.pdf_id, async () => Buffer.from(body))
      assert.deepEqual(sent, { channel: 'email' })
      const mail = fakeEmail.lastMessageTo(lead.email!)
      assert.ok(mail, 'no email reached the fake')
      assert.match(mail.subject, /Lead Document/)
    },
    { actor: TEST_ACTOR.id, lock: SEND_LOCKS }
  )
})

test('send refuses a lead it cannot reach, and a pdf that is not the lead’s', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await c.query('UPDATE leads.leads SET phone = NULL, email = NULL WHERE id = $1', [lead.id])
      await asAdmin(async () => {
        const made = await upload(lead.id)
        const unreachable = await request(app)
          .post(`/api/leads/${lead.id}/documents/${made.body.pdf_id}/send`)
          .send({})
        assert.equal(unreachable.status, 422, unreachable.text)
        const other = await request(app)
          .post(`/api/leads/${lead.id}/documents/${anUnknownId()}/send`)
          .send({})
        assert.equal(other.status, 404, other.text)
      })
    },
    { actor: TEST_ACTOR.id, lock: SEND_LOCKS }
  )
})
