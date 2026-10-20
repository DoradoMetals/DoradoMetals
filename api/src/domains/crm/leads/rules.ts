import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type { LeadPatch, LeadView } from '@dorado/contracts'

export function assertLead<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${id}`)
}

export function assertArchived<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new Conflict(`lead ${id} is not archived`)
}

export function assertNotArchived(lead: LeadView): void {
  if (lead.archived_at) throw new Conflict(`lead ${lead.id} is archived; restore it first`)
}

export function assertArchivedNow(archived: boolean, id: string): void {
  if (!archived) throw new NotFound(`no live lead ${id}`)
}

export function assertNotConverted(lead: LeadView): void {
  if (lead.converted_at) throw new Conflict(`lead ${lead.id} is already converted`)
}

export function assertHasEmail(
  lead: LeadView,
  email: string | null | undefined
): asserts email is string {
  if (!email || !email.trim()) {
    throw new Invalid(`lead ${lead.id} has no email; supply one to convert it to a customer`)
  }
}

export function assignmentMoved(lead: LeadView, patch: LeadPatch): boolean {
  if (!('assigned_to_id' in patch)) return false
  return (patch.assigned_to_id ?? null) !== lead.assigned_to_id
}

export function assertPhoneFree(existing: LeadView | null | undefined): void {
  if (existing) {
    throw new Conflict('A lead with this phone number already exists.')
  }
}
