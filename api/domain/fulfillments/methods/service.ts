// What a fulfillment METHOD means, as opposed to how it is stored.
// This resource orchestrates for itself: checkout, intake and the admin screen all reach THIS service - never transport/fulfillments/service.ts - so a caller needing the menu doesn't drag in pickups, directs, shipments and the schedule.
// The eleven rows come from 047_seed_reference_data.sql - there's no exchange side and never will be, so nothing here is a migration shim.
import * as methods from "#db/fulfillments/methods/repo.ts";
import * as rules from "#domain/fulfillments/rules.ts";
import type { MethodRow } from "#db/fulfillments/methods/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Direction, FulfillmentCategory, FulfillmentMethodPatch } from "@dorado/contracts";

// Direction is the contract's; category is the generated row's own enum. Neither is hand-written here, so widening either is a compile error, not a runtime surprise.

// The transport parses `direction` against the contract; this takes the
// parsed value.
export async function listAvailable(
  direction: Direction, executor?: Executor
): Promise<MethodRow[]> {
  return await methods.getAvailable(direction, executor);
}

export async function listAll(executor?: Executor): Promise<MethodRow[]> {
  return await methods.getAll(executor);
}

export async function getOne(
  id: string, executor?: Executor
): Promise<MethodRow | undefined> {
  return await methods.getOne(id, executor);
}

// By id, for composing a method into a fulfillment without a join per row.
export async function byId(executor?: Executor): Promise<Map<string, MethodRow>> {
  return await methods.byId(executor);
}

// The default for a direction and category. Both come from the seed, not a constant here, so changing the business's default is an UPDATE, not a deploy.
// REFUSES rather than returning undefined: a silent null becomes a null method_id and a foreign key violation three calls later.
export async function getDefault(
  { direction, category }: { direction: Direction; category: FulfillmentCategory },
  executor?: Executor
): Promise<MethodRow> {
  const method = await methods.getDefault({ direction, category }, executor);
  rules.assertDefault(method, { direction, category });
  return method;
}

// Whether a method was offered - the one rule here about the business, not the schema, and unenforceable by a constraint: a client posting a method_id it was never shown (OWN LABEL, hidden on purpose) would otherwise get it.
export async function assertOffered(
  { method_id, direction }: { method_id: string; direction: Direction },
  executor?: Executor
): Promise<void> {
  rules.assertOffered(
    await methods.getAvailable(direction, executor), method_id, direction
  );
}

// Requires the id, because the UPDATE keys on it. Without it the statement
// matches nothing, which reads as "not found" rather than "you forgot to say
// which one".
export async function update(
  id: string, patch: FulfillmentMethodPatch
): Promise<MethodRow | null> {
  const changed = await methods.update(id, patch);
  if (!changed) return null;
  return (await methods.getOne(id)) ?? null;
}
