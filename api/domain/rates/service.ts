// Rates: the volume bands the business pays on, and the page that prints them.
//
// LOAD -> ASSERT -> WRITE -> AFTER. Refusals are rules.ts's (ruling 65); one
// withTransaction per use case, and the writers take the tx (ruling 56).
import withTransaction from "#shared/db/withTransaction.ts";
import * as rates from "#db/rates/repo.ts";
import * as rules from "#domain/rates/rules.ts";
import type { AdminRate, RatePatch, RateRead, RateTier } from "@dorado/contracts";

export async function listRates(): Promise<RateRead[]> {
  return await rates.list();
}

export async function listAdminRates(): Promise<AdminRate[]> {
  return await rates.listAdmin();
}

// The rates PAGE: one card per metal, one column per volume band.
export async function listTiers(): Promise<RateTier[]> {
  return rules.tiers(await rates.list());
}

export async function getRate(id: string): Promise<AdminRate> {
  const row = await rates.getOne(id);
  rules.assertRate(row, id);
  return row;
}

export async function createRate(patch: RatePatch): Promise<AdminRate> {
  const id = await withTransaction(async (tx) => await rates.create(patch, tx));
  return await getRate(id);
}

export async function updateRate(id: string, patch: RatePatch): Promise<AdminRate> {
  const changed = await withTransaction(async (tx) => await rates.update(id, patch, tx));
  rules.assertChanged(changed, id);
  return await getRate(id);
}

export async function deleteRate(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => await rates.remove(id, tx));
}
