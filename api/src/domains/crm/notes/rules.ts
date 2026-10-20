import { Invalid, NotFound } from '#shared/errors.ts'
import type { NoteSubject } from '@dorado/contracts'

export function assertNote<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no note ${id}`)
}

export function assertOneSubject(subject: NoteSubject): void {
  const named = [subject.user_id, subject.lead_id, subject.order_id, subject.refining_order_id]
  if (named.filter(Boolean).length !== 1) {
    throw new Invalid(
      'a note read names exactly one of user_id, lead_id, order_id or refining_order_id'
    )
  }
}
