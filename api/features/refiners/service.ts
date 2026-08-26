// Refiners, straight through to the switch.
import * as refinerRepo from "#features/refiners/repo.js";
import type { RefinerRow } from "#features/refiners/repo.next.ts";

export async function getAllRefiners(): Promise<RefinerRow[]> {
  return await refinerRepo.getAllRefiners();
}

// Took `ids` and passed `id`, which was never defined - a ReferenceError on
// every call. Renamed to match what the repo actually wants: one id.
export async function getRefinerFromId(id: string): Promise<RefinerRow | null> {
  return await refinerRepo.getRefinerFromId(id);
}
