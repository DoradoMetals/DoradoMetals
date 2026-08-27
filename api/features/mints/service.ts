// Mints: reference data, read only.
//
// No dual write and no legacy repo, because nothing writes mints. If that
// changes, this is where the transaction and the exchange write would go.
import * as mints from "#features/mints/repo.ts";
import type { MintRow } from "#features/mints/repo.ts";

export async function getAllMints(): Promise<MintRow[]> {
  return await mints.getAll();
}
