import * as carriersRepo from '../repositories/carriersRepo.js';

export async function getAll() {
  return await carriersRepo.getAll();
}