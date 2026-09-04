// Mints: reference data, read only. Nothing writes mints; if that changes,
// this is where the transaction would go.
import * as mints from "#db/mints/repo.ts";
import type { Mint } from "@dorado/contracts";

export async function listMints(): Promise<Mint[]> {
  return await mints.list();
}
