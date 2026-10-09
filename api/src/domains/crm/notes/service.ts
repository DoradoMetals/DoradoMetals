import withTransaction from '#shared/db/withTransaction.ts'
import * as notes from '#db/crm/notes/repo.ts'
import * as rules from '#crm/notes/rules.ts'
import type { NoteCreateBody, NotePatch, NoteSubject, NoteView } from '@dorado/contracts'

export async function forSubject(subject: NoteSubject): Promise<NoteView[]> {
  rules.assertOneSubject(subject)
  return await notes.forSubject(subject)
}

export async function create(body: NoteCreateBody): Promise<NoteView> {
  return withTransaction(async (tx) => await notes.create(body, tx))
}

export async function update(id: string, patch: NotePatch): Promise<NoteView> {
  return withTransaction(async (tx) => {
    const written = await notes.update(id, patch, tx)
    rules.assertNote(written, id)
    return written
  })
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (tx) => await notes.remove(id, tx))
}
