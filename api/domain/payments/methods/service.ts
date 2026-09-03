// The methods a customer can pay with (direction=sale) or be paid by
// (direction=purchase) - fees, delays, labels and the payout marketing copy,
// as rows (D207). The frontend used to hardcode all of it in two arrays.
import * as repo from "#db/payments/methods/repo.ts";
import { Invalid } from "#shared/errors.ts";
import type { MethodRow } from "#db/payments/methods/repo.ts";

export type { MethodRow } from "#db/payments/methods/repo.ts";

const DIRECTIONS = new Set(["sale", "purchase"]);

export async function getMethods(direction?: string | null): Promise<MethodRow[]> {
  if (direction == null) return await repo.list();
  if (!DIRECTIONS.has(direction)) {
    throw new Invalid(`direction must be 'sale' or 'purchase'`);
  }
  return await repo.listFor(direction);
}
