import * as repo from "#db/payments/methods/repo.ts";
import type { Direction, PaymentMethod } from "@dorado/contracts";

export type { PaymentMethod } from "@dorado/contracts";

export async function getMethods(direction?: Direction | null): Promise<PaymentMethod[]> {
  if (direction == null) return await repo.list();
  return await repo.listFor(direction);
}
