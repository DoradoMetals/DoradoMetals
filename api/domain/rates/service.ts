// Rates: orchestration and the composed shape.
//
// list is consumed by the PRICING path as well as by HTTP -
// features/orders/create.ts and purchase-orders/service.ts both resolve a
// customer's rate from it - and resolveRate keys on the metal NAME. So the
// composed shape is what the service returns, not the bare table row.
//
// update TAKES AN ID AND A PATCH, never a round-tripped row. The repo answers
// whether a row changed; this refetches so the response still carries the
// fresh state the caller expects.
import withTransaction from "#shared/db/withTransaction.ts";
import * as rates from "#db/rates/repo.ts";
import * as compose from "#domain/rates/compose.ts";
import type { NewRate, RatePatch } from "#db/rates/repo.ts";

interface HttpError extends Error { statusCode?: number }
const notFound = (id: string): HttpError => {
  const e: HttpError = new Error(`no rate ${id}`);
  e.statusCode = 404;
  return e;
};

export async function getRate(id: string) {
  const row = await rates.getOne(id);
  if (!row) throw notFound(id);
  return await compose.toAdminOne(row);
}

export async function getAllRates() {
  return await compose.toPublicList(await rates.list());
}

export async function getAdminRates() {
  return await compose.toAdminList(await rates.list());
}

export async function createRate(rate: NewRate, user_name?: string) {
  const row = await withTransaction(async (c) => {
    return await rates.create(
      {
        id: rate.id ?? null,
        metal_id: rate.metal_id,
        unit: rate.unit,
        min_qty: rate.min_qty,
        max_qty: rate.max_qty,
        scrap_pct: rate.scrap_pct,
        bullion_pct: rate.bullion_pct,
        created_by: user_name ?? rate.created_by,
        updated_by: user_name ?? rate.updated_by,
      },
      c
    );
  });
  return await compose.toAdminOne(row);
}

export async function updateRate(id: string, patch: RatePatch, user_name: string) {
  const changed = await withTransaction(async (c) => {
    return await rates.update(
      id,
      {
        metal_id: patch.metal_id,
        unit: patch.unit,
        min_qty: patch.min_qty,
        max_qty: patch.max_qty,
        scrap_pct: patch.scrap_pct,
        bullion_pct: patch.bullion_pct,
        created_by: patch.created_by,
        updated_by: user_name,
      },
      c
    );
  });
  if (!changed) throw notFound(id);
  const row = await rates.getOne(id);
  if (!row) throw notFound(id);
  return await compose.toAdminOne(row);
}

export async function deleteRate(id: string) {
  return await withTransaction(async (c) => {
    return await rates.remove(id, c);
  });
}
