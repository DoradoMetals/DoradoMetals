import withTransaction from '#shared/db/withTransaction.ts'
import * as leads from '#db/leads/repo.ts'
import * as documents from '#db/leads/documents/repo.ts'
import * as pdfs from '#documents/pdfs/service.ts'
import * as rules from '#crm/lead-documents/rules.ts'
import type { LeadDocumentView } from '@dorado/contracts'

export async function forLead(lead_id: string): Promise<LeadDocumentView[]> {
  const lead = await leads.getOne(lead_id)
  rules.assertLead(lead, lead_id)
  return await documents.forLead(lead_id)
}

export async function add(lead_id: string, bytes: Uint8Array | null): Promise<LeadDocumentView> {
  rules.assertUpload(bytes)
  const lead = await leads.getOne(lead_id)
  rules.assertLead(lead, lead_id)
  const held = await documents.forLead(lead_id)
  rules.assertRoom(held.length)

  const pdf_id = await pdfs.storeUnattachedUpload('lead_document', bytes)
  return withTransaction(async (tx) => await documents.create(lead_id, pdf_id, tx))
}

export async function remove(lead_id: string, pdf_id: string): Promise<LeadDocumentView[]> {
  const unlinked = await withTransaction(async (tx) => await documents.remove(lead_id, pdf_id, tx))
  rules.assertUnlinked(unlinked, pdf_id)
  return await documents.forLead(lead_id)
}
