// Rates: orchestration and the composed shape.
//
// list is consumed by the pricing path as well as HTTP, and resolveRate keys on the metal NAME - so the composed shape is what the service returns, not the bare table row.
// update takes an id and a patch, never a round-tripped row; it refetches after so the response still carries fresh state.
import withTransaction from "#shared/db/withTransaction.ts";
import * as rates from "#db/rates/repo.ts";
import * as compose from "#domain/rates/compose.ts";
import type { RatePatch } from "#db/rates/repo.ts";
import { NotFound } from "#shared/errors.ts";

export async function getRate(id: string) {
  const row = await rates.getOne(id);
  if (!row) throw new NotFound(`no rate ${id}`);
  return await compose.toAdminOne(row);
}

export async function getAllRates() {
  return await compose.toPublicList(await rates.list());
}

export async function getAdminRates() {
  return await compose.toAdminList(await rates.list());
}

export async function createRate(rate: RatePatch) {
  const row = await withTransaction(async (c) => {
    return await rates.create(rate, c);
  });
  return await compose.toAdminOne(row);
}

export async function updateRate(id: string, patch: RatePatch) {
  const changed = await withTransaction(async (c) => {
    return await rates.update(id, patch, c);
  });
  if (!changed) throw new NotFound(`no rate ${id}`);
  const row = await rates.getOne(id);
  if (!row) throw new NotFound(`no rate ${id}`);
  return await compose.toAdminOne(row);
}

export async function deleteRate(id: string) {
  return await withTransaction(async (c) => {
    return await rates.remove(id, c);
  });
}
