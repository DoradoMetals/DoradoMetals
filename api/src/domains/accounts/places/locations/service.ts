import * as locations from '#db/places/locations/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { LocationView } from '@dorado/contracts'

export async function list(
  organization_id: string | null,
  executor?: Executor
): Promise<LocationView[]> {
  return await locations.getAll(organization_id, executor)
}
