// Mints: reference data, read only. Nothing writes mints; if that changes, this is where the transaction would go.
import * as mints from "#db/mints/repo.ts";
import type { MintRow } from "#db/mints/repo.ts";

export async function getAllMints(): Promise<MintRow[]> {
  return await mints.list();
}
