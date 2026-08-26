// What a fulfillment means, as opposed to how it is stored.
//
// Two rules live here rather than in the repo, because both are about the
// business and neither is enforceable by a constraint:
//
//   a customer may only see and schedule their own order's fulfillment, and
//   the method a customer picks has to be one they were offered.
//
// The second is the one that matters. getAvailable filters on enabled and
// hidden, and a client that posts a method_id it was never shown - OWN LABEL,
// say, which is hidden precisely because it is an admin's decision - would
// otherwise get it. Checking the id against the same query that produced the
// menu is what makes the menu mean something.
//
// THERE IS NO repo.next AND NEVER WILL BE. Fulfillments are capability exchange
// never recorded - there is no source to read from, so a *_SOURCE switch would
// have one state. That also means these are the shapes a contract is worth the
// most on: nothing else is comparing them against a second implementation.
import * as fulfillmentsRepo from "#features/fulfillments/repo.js";
import * as methodsRepo from "#features/fulfillments/methods/repo.js";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// Re-exported from the repo declarations rather than restated here. Stating a
// row shape twice is how the two drift, and the repos are what actually decide
// it.
export type { FulfillmentRow } from "#features/fulfillments/repo.js";
export type { MethodRow } from "#features/fulfillments/methods/repo.js";
import type { FulfillmentRow } from "#features/fulfillments/repo.js";
import type { MethodRow } from "#features/fulfillments/methods/repo.js";

export type Direction = "purchase" | "sale";
export type Category = "SHIPMENT" | "PICKUP" | "DIRECT";

// `direction` is checked rather than declared, because it arrives as a query
// string. The narrow type is what the guard produces, not what it receives.
export async function listMethods(direction: unknown): Promise<MethodRow[]> {
  if (direction !== "purchase" && direction !== "sale") {
    throw new Error(`direction must be "purchase" or "sale", got ${direction}`);
  }
  return await methodsRepo.getAvailable(direction);
}

export async function listAllMethods(): Promise<MethodRow[]> {
  return await methodsRepo.getAll();
}

// Requires the id, because the UPDATE keys on it - `WHERE m.id = $1`. Without
// it the statement matches nothing and returns null, which reads as "not
// found" rather than "you forgot to say which one". The compiler asked for
// this; the repo declaration is where the requirement is written down.
export async function updateMethod(
  method: Partial<MethodRow> & { id: string }
): Promise<MethodRow | null> {
  return await methodsRepo.update(method);
}

// A fulfillment carries no user of its own, so "is this yours" is a question
// about the order. requireUser alone would have let any signed-in customer read
// any order's pickup address and appointment time by changing a query string -
// the same class of hole as an unguarded route, and invisible from the routes
// file because the guard is present and simply not enough.
//
// Returns null for "not yours" as well as "not found", deliberately: telling
// the two apart would confirm the order exists.
export async function getForOrder(
  order_id: string,
  { userId, isAdmin = false }: { userId?: string; isAdmin?: boolean } = {}
): Promise<FulfillmentRow | null> {
  if (!isAdmin) {
    const owner = await fulfillmentsRepo.ownerOf(order_id);
    if (!owner || owner !== userId) return null;
  }
  return await fulfillmentsRepo.getByOrder(order_id);
}

export async function getSchedule(filters: {
  from?: string;
  to?: string;
  employee_id?: string;
}): Promise<FulfillmentRow[]> {
  return await fulfillmentsRepo.getScheduled(filters);
}

// Choosing a method, from the customer's side. Admin callers go through the
// repo, which is why the offered-method check is here and not there: an admin
// putting an order on OWN LABEL is the reason OWN LABEL exists.
export async function choose(
  {
    order_id,
    method_id,
    direction,
    created_by_id,
  }: {
    order_id: string;
    method_id: string;
    direction: Direction;
    created_by_id?: string | null;
  },
  executor?: Executor
): Promise<FulfillmentRow | null> {
  const offered = await methodsRepo.getAvailable(direction, executor);
  if (!offered.some((m: MethodRow) => m.id === method_id)) {
    throw new Error(
      `fulfillment method ${method_id} is not available for a ${direction} - ` +
        `it is disabled, hidden, or belongs to the other direction`
    );
  }
  return await fulfillmentsRepo.create(
    { order_id, method_id, created_by_id },
    executor
  );
}

// A method that has already been decided, by id.
//
// choose() is the CUSTOMER's path and checks the id against the same query that
// produced the menu, which is what makes the menu mean something. This is the
// path for a method that was already validated - recorded on a checkout at
// intake, or picked by an admin who is allowed the hidden ones. Skipping the
// menu check here is the difference between the two, and it is why they are two
// functions rather than a flag.
export async function chooseById(
  {
    order_id,
    method_id,
    created_by_id,
  }: { order_id: string; method_id: string; created_by_id?: string | null },
  executor?: Executor
): Promise<FulfillmentRow | null> {
  return await fulfillmentsRepo.create(
    { order_id, method_id, created_by_id },
    executor
  );
}

// The default for a direction and category, for the flows that do not ask.
// A sale with nothing chosen is a DROPSHIP; a purchase with nothing chosen is a
// CARRIER DROPOFF. Both come from the seed rather than from a constant here, so
// changing the business's default is an UPDATE rather than a deploy.
export async function chooseDefault(
  {
    order_id,
    direction,
    category = "SHIPMENT",
    created_by_id,
  }: {
    order_id: string;
    direction: Direction;
    category?: Category;
    created_by_id?: string | null;
  },
  executor?: Executor
): Promise<FulfillmentRow | null> {
  const method = await methodsRepo.getDefault({ direction, category }, executor);
  if (!method) {
    throw new Error(`no default ${category} method for a ${direction}`);
  }
  return await fulfillmentsRepo.create(
    { order_id, method_id: method.id, created_by_id },
    executor
  );
}

export const schedulePickup = fulfillmentsRepo.schedulePickup;
export const scheduleDirect = fulfillmentsRepo.scheduleDirect;
export const cancelSchedule = fulfillmentsRepo.cancelSchedule;
export const setMethod = fulfillmentsRepo.setMethod;
export const setStatus = fulfillmentsRepo.setStatus;
