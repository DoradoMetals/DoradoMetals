import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import type { Executor } from '#shared/db/executor.ts'
import { SpotSettingsPatch, type SpotSettings } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(SpotSettingsPatch)

export async function getOne(executor?: Executor): Promise<SpotSettings> {
  const { rows } = await query<SpotSettings>(sql('get_one'), [], executor)
  return rows[0]
}

export async function update(patch: SpotSettingsPatch, executor?: Executor): Promise<boolean> {
  const built = buildUpdate({
    table: 'spots.settings',
    allowed: PATCHABLE,
    patch,
    where: { id: true },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}
