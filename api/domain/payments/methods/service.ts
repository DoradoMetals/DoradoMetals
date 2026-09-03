// The methods a customer can pay with (direction=sale) or be paid by
// (direction=purchase) - fees, delays, labels and the payout marketing copy,
// as rows (D207). The frontend used to hardcode all of it in two arrays.
import * as repo from "#db/payments/methods/repo.ts";
import type { MethodRow } from "#db/payments/methods/repo.ts";
import type { orders } from "@dorado/contracts";

export type { MethodRow } from "#db/payments/methods/repo.ts";

// No direction means both. The transport parses the direction against the
// contract, so a value that reaches here is one of the two.
export async function getMethods(direction?: orders.enums.Direction | null): Promise<MethodRow[]> {
  if (direction == null) return await repo.list();
  return await repo.listFor(direction);
}
