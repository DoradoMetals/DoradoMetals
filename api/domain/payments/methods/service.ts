// The methods a customer can pay with (direction=sale) or be paid by
// (direction=purchase) - fees, delays, labels and the payout marketing copy,
// as rows (D207). The frontend used to hardcode all of it in two arrays;
// 047/109 made the table complete and this read makes it the source.
import * as repo from "#db/payments/methods/repo.ts";
import type { MethodRow } from "#db/payments/methods/repo.ts";

const DIRECTIONS = new Set(["sale", "purchase"]);

export async function getMethods(direction?: string | null): Promise<MethodRow[]> {
  if (direction != null && !DIRECTIONS.has(direction)) {
    const err: Error & { statusCode?: number } = new Error(
      `direction must be 'sale' or 'purchase'`
    );
    err.statusCode = 400;
    throw err;
  }
  return await repo.getAll(direction ?? null);
}
