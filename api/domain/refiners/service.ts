// Refiners: read only, composed from two tables.
import * as refiners from "#db/refiners/repo.ts";
import * as compose from "#domain/refiners/compose.ts";
import type { ComposedRefiner } from "#domain/refiners/compose.ts";

export async function getAllRefiners(): Promise<ComposedRefiner[]> {
  return await compose.all(await refiners.getAll());
}

export async function getRefinerFromId(id: string): Promise<ComposedRefiner | null> {
  const row = await refiners.getOne(id);
  if (!row) return null;
  return await compose.one(row);
}
