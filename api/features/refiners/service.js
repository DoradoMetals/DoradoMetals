import * as refinerRepo from "#features/refiners/repo.js"

export async function getAllRefiners() {
  return await refinerRepo.getAllRefiners();
}

// Took `ids` and passed `id`, which was never defined - a ReferenceError on
// every call. Renamed to match what the repo actually wants: one id.
export async function getRefinerFromId(id) {
  return await refinerRepo.getRefinerFromId(id);
}

