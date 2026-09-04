import * as metals from "#db/metals/repo.ts";
import type { Metal } from "@dorado/contracts";

export async function listMetals(): Promise<Metal[]> {
  return await metals.list();
}
