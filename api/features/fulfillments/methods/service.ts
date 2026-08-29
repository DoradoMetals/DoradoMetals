// What a fulfillment METHOD means, as opposed to how it is stored.
//
// THIS RESOURCE ORCHESTRATES FOR ITSELF (ruling 26b). Methods are not a
// passive table hanging off fulfillments: checkout asks which methods a
// direction offers, the intake path resolves a default, and the admin screen
// edits them. Every one of those consumers reaches THIS service - never
// features/fulfillments/service.ts - so that a caller who needs the menu does
// not drag in pickups, directs, shipments and the schedule with it.
//
// The eleven rows come from 047_seed_reference_data.sql. There is no exchange
// side and never will be (see repo.ts), so nothing here is a migration shim.
import * as methods from "#features/fulfillments/methods/repo.ts";
import { refuse } from "#shared/http/refuse.ts";
import type { MethodRow, MethodInput } from "#features/fulfillments/methods/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { MethodRow, MethodInput } from "#features/fulfillments/methods/repo.ts";

export type Direction = "purchase" | "sale";
export type Category = "SHIPMENT" | "PICKUP" | "DIRECT";

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

// The default for a direction and category, for the flows that do not ask.
// A sale with nothing chosen is a DROPSHIP; a purchase with nothing chosen is
// a CARRIER DROPOFF. Both come from the seed rather than from a constant here,
// so changing the business's default is an UPDATE rather than a deploy.
//
// REFUSES rather than returning undefined: a flow that reaches here has already
// decided it wants the default, and a silent null becomes a null method_id and
// a foreign key violation three calls later.
export async function getDefault(
  { direction, category }: { direction: Direction; category: Category },
  executor?: Executor
): Promise<MethodRow> {
  const method = await methods.getDefault({ direction, category }, executor);
  if (!method) throw refuse(404, `no default ${category} method for a ${direction}`);
  return method;
}

// WHETHER A METHOD WAS OFFERED, which is the one rule here that is about the
// business rather than the schema and is not enforceable by a constraint: the
// method a customer picks has to be one they were offered.
//
// getAvailable filters on enabled and hidden, and a client that posts a
// method_id it was never shown - OWN LABEL, say, which is hidden precisely
// because it is an admin's decision - would otherwise get it. Checking the id
// against the same query that produced the menu is what makes the menu mean
// something.
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
// matches nothing and returns null, which reads as "not found" rather than
// "you forgot to say which one".
export async function update(method: MethodInput): Promise<MethodRow | null> {
  return (await methods.update(method)) ?? null;
}
