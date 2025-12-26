import * as repo from "#features/carriers/repo.js"

export async function getAll() {
  return await repo.getAll();
}