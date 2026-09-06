import * as locations from '#db/places/locations/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { Location } from '@dorado/contracts'

export async function list(executor?: Executor): Promise<Location[]> {
  return await locations.getAll(executor)
}
