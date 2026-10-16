import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import { Note, NoteCreateBody, NotePatch } from '@dorado/contracts'
import type { NoteSubject, NoteView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

const GET_ALL_SQL = sql('get_all')
const GET_ONE_SQL = sql('get_one')
const CREATE_SQL = sql('create')

export const PATCHABLE = columnsOf(NotePatch)

const RETURNING = `${returningOf(Note)}, created_by_id AS author_id`

export async function getOne(id: string, executor?: Executor): Promise<NoteView | undefined> {
  const { rows } = await query<NoteView>(GET_ONE_SQL, [id], executor)
  return rows[0]
}

export async function forSubject(subject: NoteSubject, executor?: Executor): Promise<NoteView[]> {
  const { rows } = await query<NoteView>(
    GET_ALL_SQL,
    [subject.user_id, subject.lead_id, subject.order_id ?? null],
    executor
  )
  return rows
}

export async function create(row: NoteCreateBody, executor?: Executor): Promise<NoteView> {
  const { rows } = await query<NoteView>(
    CREATE_SQL,
    [row.user_id ?? null, row.lead_id ?? null, row.order_id ?? null, row.body],
    executor
  )
  return rows[0]!
}

export async function update(
  id: string,
  patch: NotePatch,
  executor?: Executor
): Promise<NoteView | undefined> {
  const built = buildUpdate({
    table: 'crm.notes',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<NoteView>(built.text, built.values, executor)
  return rows[0]
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}

export async function repointLeadToUser(
  lead_id: string,
  user_id: string,
  executor?: Executor
): Promise<number> {
  const { rowCount } = await query(sql('repoint_lead_to_user'), [lead_id, user_id], executor)
  return rowCount ?? 0
}
