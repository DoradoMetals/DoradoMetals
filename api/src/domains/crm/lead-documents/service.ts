import withTransaction from '#shared/db/withTransaction.ts'
import * as leads from '#db/leads/repo.ts'
import * as documents from '#db/leads/documents/repo.ts'
import * as pdfs from '#documents/pdfs/service.ts'
import * as emails from '#documents/emails/service.ts'
import * as smsService from '#crm/sms/service.ts'
import * as contactPreferences from '#db/leads/contact-preferences/repo.ts'
import type { StoredReader } from '#documents/pdfs/serve.ts'
import * as rules from '#crm/lead-documents/rules.ts'
import type { LeadDocumentSent, LeadDocumentView } from '@dorado/contracts'

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

export async function url(lead_id: string, pdf_id: string): Promise<string> {
  rules.assertDocument(await documents.getOne(lead_id, pdf_id), pdf_id)
  return await pdfs.signedUrl(pdf_id)
}

export async function send(
  lead_id: string,
  pdf_id: string,
  storage?: StoredReader
): Promise<LeadDocumentSent> {
  const lead = await leads.getOne(lead_id)
  rules.assertLead(lead, lead_id)
  const document = await documents.getOne(lead_id, pdf_id)
  rules.assertDocument(document, pdf_id)
  const preference = lead.contact_preference_id
    ? await contactPreferences.getOne(lead.contact_preference_id)
    : null
  const channel = rules.channelFor(lead, preference?.key ?? null)
  if (channel === 'sms') {
    const link = await pdfs.signedUrl(pdf_id)
    await smsService.sendMessage(lead.phone!, rules.documentText(document.name, link))
    return { channel }
  }
  const bytes = await pdfs.bytesOf(pdf_id, storage)
  await emails.sendLeadDocument(lead_id, document.name, bytes, pdf_id)
  return { channel }
}
