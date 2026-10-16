import { Invalid, NotFound } from '#shared/errors.ts'
import type { NoteSubject } from '@dorado/contracts'

export function assertNote<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no note ${id}`)
}

export function assertOneSubject(subject: NoteSubject): void {
  if ([subject.user_id, subject.lead_id, subject.order_id].filter(Boolean).length !== 1) {
    throw new Invalid('a note read names exactly one of user_id, lead_id or order_id')
  }
}
