import * as methods from "#db/fulfillments/methods/repo.ts";
import * as rules from "#domain/fulfillments/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  Direction, FulfillmentCategory, FulfillmentMethodPatch, FulfillmentMethodRead,
} from "@dorado/contracts";

export async function listAvailable(
  direction: Direction, executor?: Executor
): Promise<FulfillmentMethodRead[]> {
  return await methods.getAvailable(direction, executor);
}

export async function listAll(executor?: Executor): Promise<FulfillmentMethodRead[]> {
  return await methods.getAll(executor);
}

export async function getOne(
  id: string, executor?: Executor
): Promise<FulfillmentMethodRead | undefined> {
  return await methods.getOne(id, executor);
}

export async function byId(executor?: Executor): Promise<Map<string, FulfillmentMethodRead>> {
  return await methods.byId(executor);
}

export async function getDefault(
  { direction, category }: { direction: Direction; category: FulfillmentCategory },
  executor?: Executor
): Promise<FulfillmentMethodRead> {
  const method = await methods.getDefault({ direction, category }, executor);
  rules.assertDefault(method, { direction, category });
  return method;
}

export async function assertOffered(
  { method_id, direction }: { method_id: string; direction: Direction },
  executor?: Executor
): Promise<void> {
  rules.assertOffered(
    await methods.getAvailable(direction, executor), method_id, direction
  );
}

export async function update(
  id: string, patch: FulfillmentMethodPatch
): Promise<FulfillmentMethodRead | null> {
  const changed = await methods.update(id, patch);
  if (!changed) return null;
  return (await methods.getOne(id)) ?? null;
}
