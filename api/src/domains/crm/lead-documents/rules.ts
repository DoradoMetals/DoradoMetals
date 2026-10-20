import { Invalid, NotFound } from '#shared/errors.ts'
import type { LeadDocumentChannel, LeadView } from '@dorado/contracts'

export const MAX_DOCUMENTS_PER_LEAD = 3

export function assertLead<T>(row: T | null | undefined, lead_id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${lead_id}`)
}

export function assertUpload(bytes: Uint8Array | null | undefined): asserts bytes is Uint8Array {
  if (!bytes || bytes.length === 0) {
    throw new Invalid('the request carries no file - send it as multipart/form-data')
  }
}

export function assertRoom(held: number): void {
  if (held >= MAX_DOCUMENTS_PER_LEAD) {
    throw new Invalid(
      `a lead holds at most ${MAX_DOCUMENTS_PER_LEAD} documents - unlink one before adding another`
    )
  }
}

export function assertUnlinked(unlinked: boolean, pdf_id: string): void {
  if (!unlinked) throw new NotFound(`no document ${pdf_id} on this lead`)
}

export function assertDocument<T>(row: T | null | undefined, pdf_id: string): asserts row is T {
  if (!row) throw new NotFound(`no document ${pdf_id} on this lead`)
}

export function channelFor(lead: LeadView, preference: string | null): LeadDocumentChannel {
  if (preference === 'email' && lead.email) return 'email'
  if (preference === 'text' && lead.phone) return 'sms'
  if (lead.phone) return 'sms'
  if (lead.email) return 'email'
  throw new Invalid(`lead ${lead.id} has neither a phone nor an email to send to`)
}

export function documentText(name: string, url: string): string {
  return `Dorado Metals: your ${name} is ready. Download it here: ${url}`
}
