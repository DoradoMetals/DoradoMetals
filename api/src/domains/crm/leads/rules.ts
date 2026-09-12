import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type { Lead } from '@dorado/contracts'

export function assertLead<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${id}`)
}

export function assertNotConverted(lead: Lead): void {
  if (lead.converted) throw new Conflict(`lead ${lead.id} is already converted`)
}

export function assertHasEmail(
  lead: Lead,
  email: string | null | undefined
): asserts email is string {
  if (!email || !email.trim()) {
    throw new Invalid(`lead ${lead.id} has no email; supply one to convert it to a customer`)
  }
}
