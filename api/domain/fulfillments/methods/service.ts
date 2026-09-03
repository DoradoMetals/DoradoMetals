// What a fulfillment METHOD means, as opposed to how it is stored.
// This resource orchestrates for itself: checkout, intake and the admin screen all reach THIS service - never transport/fulfillments/service.ts - so a caller needing the menu doesn't drag in pickups, directs, shipments and the schedule.
// The eleven rows come from 047_seed_reference_data.sql - there's no exchange side and never will be, so nothing here is a migration shim.
import * as methods from "#db/fulfillments/methods/repo.ts";
import { refuse } from "#shared/http/refuse.ts";
import type { MethodRow, MethodPatch } from "#db/fulfillments/methods/repo.ts";
import type { PoolClient } from "pg";
import type { fulfillments } from "@dorado/contracts";

type Executor = PoolClient | undefined;

export type { MethodRow, MethodPatch } from "#db/fulfillments/methods/repo.ts";

// direction/category come from the database, not hand-written here: a hand-written union either duplicates an enum by hand (direction, spelled three times) or asserts a constraint the column didn't have (category was `text DEFAULT 'OTHER'` until it became a real enum).
// These are derived from the generated row now, so widening the enum is a compile error, not a runtime surprise.
type Direction = NonNullable<fulfillments.MethodsRow["direction"]>;
type Category = fulfillments.MethodsRow["category"];

// `direction` is CHECKED rather than declared, because it arrives as a query
// string. The narrow type is what the guard produces, not what it receives.
export async function listAvailable(
  direction: unknown, executor?: Executor
): Promise<MethodRow[]> {
  if (direction !== "purchase" && direction !== "sale") {
    throw refuse(400, `direction must be "purchase" or "sale", got ${direction}`);
  }
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
  { direction, category }: { direction: Direction; category: Category },
  executor?: Executor
): Promise<MethodRow> {
  const method = await methods.getDefault({ direction, category }, executor);
  if (!method) throw refuse(404, `no default ${category} method for a ${direction}`);
  return method;
}

// Whether a method was offered - the one rule here about the business, not the schema, and unenforceable by a constraint: a client posting a method_id it was never shown (OWN LABEL, hidden on purpose) would otherwise get it.
export async function assertOffered(
  { method_id, direction }: { method_id: string; direction: Direction },
  executor?: Executor
): Promise<void> {
  const offered = await methods.getAvailable(direction, executor);
  if (!offered.some((m) => m.id === method_id)) {
    throw refuse(
      409,
      `fulfillment method ${method_id} is not available for a ${direction} - ` +
        `it is disabled, hidden, or belongs to the other direction`
    );
  }
}

// Requires the id, because the UPDATE keys on it. Without it the statement
// matches nothing, which reads as "not found" rather than "you forgot to say
// which one".
export async function update(id: string, patch: MethodPatch): Promise<MethodRow | null> {
  const changed = await methods.update(id, patch);
  if (!changed) return null;
  return (await methods.getOne(id)) ?? null;
}
