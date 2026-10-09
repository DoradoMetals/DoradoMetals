import type { PoolClient } from 'pg'
import type { Assignment, Note, SmsConsentEvent } from '@dorado/contracts'
import * as notes from '#db/crm/notes/repo.ts'
import * as assignments from '#db/crm/assignments/repo.ts'
import * as consentEvents from '#db/crm/consent-events/repo.ts'

export async function aNote(
  c: PoolClient,
  subject: { user_id?: string; lead_id?: string },
  body = 'Prefers a call before we ship'
): Promise<Note> {
  return await notes.create({ user_id: subject.user_id, lead_id: subject.lead_id, body }, c)
}

export async function anAssignment(
  c: PoolClient,
  subject: { user_id?: string; lead_id?: string },
  assigned_to_id: string | null
): Promise<Assignment> {
  return await assignments.create(
    { user_id: subject.user_id ?? null, lead_id: subject.lead_id ?? null, assigned_to_id },
    c
  )
}

export async function aConsentEvent(
  c: PoolClient,
  subject: { user_id?: string; lead_id?: string },
  kind: 'opt_in' | 'opt_out' = 'opt_in'
): Promise<SmsConsentEvent> {
  return await consentEvents.create(
    {
      user_id: subject.user_id ?? null,
      lead_id: subject.lead_id ?? null,
      kind,
      method: 'via_text',
    },
    c
  )
}
