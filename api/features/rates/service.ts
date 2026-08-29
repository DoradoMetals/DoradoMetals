// Rates: orchestration, the dual write, and the composed shape.
//
// getAllRates is consumed by the PRICING path as well as by HTTP -
// features/orders/create.ts and purchase-orders/service.ts both resolve a
// customer's rate from it - and resolveRate keys on the metal NAME. So the
// composed shape is what the service returns, not the bare table row.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.js";
import * as rates from "#features/rates/repo.ts";
import * as legacy from "#legacy/rates/repo.ts";
import * as wire from "#features/rates/wire.ts";
import type { RateInput } from "#features/rates/repo.ts";

interface HttpError extends Error { statusCode?: number }
const notFound = (id: string): HttpError => {
  const e: HttpError = new Error(`no rate ${id}`);
  e.statusCode = 404;
  return e;
};

export async function getRate(id: string) {
  const row = await rates.getOne(id);
  if (!row) throw notFound(id);
  return await wire.toAdminOne(row);
}

export async function getAllRates() {
  return await wire.toPublicList(await rates.getAll());
}

export async function getAdminRates() {
  return await wire.toAdminList(await rates.getAll());
}

export async function createRate(rate: RateInput, user_name?: string) {
  const id = randomUUID();
  if (user_name) rate = { ...rate, created_by: user_name, updated_by: user_name };
  const row = await withTransaction(async (c) => {
    await legacy.create(id, rate, c);
    return await rates.create(id, rate, c);
  });
  return await wire.toAdminOne(row);
}

export async function updateRate(rate: RateInput & { id: string }, user_name: string) {
  const row = await withTransaction(async (c) => {
    await legacy.update(rate, user_name, c);
    return await rates.update(rate, user_name, c);
  });
  if (!row) throw notFound(rate.id);
  return await wire.toAdminOne(row);
}

export async function deleteRate(id: string) {
  return await withTransaction(async (c) => {
    await legacy.remove(id, c);
    return await rates.remove(id, c);
  });
}
