import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead, aTag } from '#shared/testing/builders/index.ts'
import * as documents from '#db/leads/documents/repo.ts'

afterAll(async () => {
  await pool.end()
})

async function aPdf(c: PoolClient): Promise<string> {
  const tag = aTag()
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO media.pdfs (kind, path, size_bytes, checksum)
     VALUES ('lead_document', $1, 1234, $2)
     RETURNING id`,
    [`pdfs/unattached/lead_document-${tag}.pdf`, tag]
  )
  return rows[0]!.id
}

test('create links the pdf and answers its facts with it', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const pdf_id = await aPdf(c)

    const written = await documents.create(lead.id, pdf_id, c)
    assert.equal(written.lead_id, lead.id)
    assert.equal(written.pdf_id, pdf_id)
    assert.equal(written.kind, 'lead_document')
    assert.equal(written.size_bytes, 1234)
    assert.ok(written.uploaded_at, 'the timestamp of the pdf row did not come back')
  })
})

test('forLead answers only the links of that lead', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aLead(c)
    const theirs = await aLead(c)
    const linked = await documents.create(mine.id, await aPdf(c), c)
    await documents.create(theirs.id, await aPdf(c), c)

    const rows = await documents.forLead(mine.id, c)
    assert.deepEqual(
      rows.map((r) => r.pdf_id),
      [linked.pdf_id]
    )
  })
})

test('remove unlinks and leaves the pdf row alone', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const pdf_id = await aPdf(c)
    await documents.create(lead.id, pdf_id, c)

    assert.equal(await documents.remove(lead.id, pdf_id, c), true)
    assert.deepEqual(await documents.forLead(lead.id, c), [])

    const { rows } = await c.query(`SELECT 1 FROM media.pdfs WHERE id = $1`, [pdf_id])
    assert.equal(rows.length, 1, 'unlinking deleted the append-only pdf row')
  })
})

test('remove answers false for a pdf this lead never held', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.equal(await documents.remove(lead.id, await aPdf(c), c), false)
  })
})

test('the same pdf cannot be linked to one lead twice', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const pdf_id = await aPdf(c)
    await documents.create(lead.id, pdf_id, c)

    await assert.rejects(documents.create(lead.id, pdf_id, c), /lead_documents_lead_pdf/)
  })
})

test('a pdf with a live link cannot be deleted', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const pdf_id = await aPdf(c)
    await documents.create(lead.id, pdf_id, c)

    await assert.rejects(
      c.query(`DELETE FROM media.pdfs WHERE id = $1`, [pdf_id]),
      /lead_documents_pdf_fk/
    )
  })
})

test('deleting the lead unlinks its documents and keeps the pdf rows', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const pdf_id = await aPdf(c)
    await documents.create(lead.id, pdf_id, c)

    await c.query(`DELETE FROM leads.leads WHERE id = $1`, [lead.id])
    assert.deepEqual(await documents.forLead(lead.id, c), [])
    const { rows } = await c.query(`SELECT 1 FROM media.pdfs WHERE id = $1`, [pdf_id])
    assert.equal(rows.length, 1, 'the pdf row went with the lead')
  })
})
