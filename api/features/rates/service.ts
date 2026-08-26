// Rates, straight through to the switch.
//
// Return types are named rather than inferred: repo.js is JavaScript and picks
// between the implementations at runtime, so TypeScript sees `any` coming out
// of it. Taking the row type from repo.next is sound by the invariant `diff`
// already enforces - the two implementations are compared row for row.
import * as ratesRepo from "#features/rates/repo.js";
import type { RateRow, RateInput } from "#features/rates/repo.next.ts";

export async function getRate(id: string): Promise<RateRow | undefined> {
  return await ratesRepo.getRate(id);
}

export async function getAllRates(): Promise<RateRow[]> {
  return await ratesRepo.getAllRates();
}

// Admin sees every rate; getAllRates is the public list.
export async function getAdminRates(): Promise<RateRow[]> {
  return await ratesRepo.getAdminRates();
}

export async function createRate(
  rate: RateInput,
  user_name: string
): Promise<RateRow | undefined> {
  return await ratesRepo.createRate(rate, user_name);
}

export async function updateRate(
  rate: RateInput,
  user_name: string
): Promise<RateRow | undefined> {
  return await ratesRepo.updateRate(rate, user_name);
}

// Returns { success } rather than a QueryResult, matching the repo.
export async function deleteRate(id: string): Promise<{ success: boolean }> {
  return await ratesRepo.deleteRate(id);
}
