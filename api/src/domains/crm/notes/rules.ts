import { Invalid, NotFound } from '#shared/errors.ts'
import type { NoteSubject } from '@dorado/contracts'

export function assertNote<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no note ${id}`)
}

export function assertOneSubject(subject: NoteSubject): void {
  if (Boolean(subject.user_id) === Boolean(subject.lead_id)) {
    throw new Invalid('a note read names exactly one of user_id or lead_id')
  }
}
