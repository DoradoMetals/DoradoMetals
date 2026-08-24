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
import * as fulfillmentsRepo from "#features/fulfillments/repo.js";
import * as methodsRepo from "#features/fulfillments/methods/repo.js";

export async function listMethods(direction) {
  if (direction !== "purchase" && direction !== "sale") {
    throw new Error(`direction must be "purchase" or "sale", got ${direction}`);
  }
  return await methodsRepo.getAvailable(direction);
}

export async function listAllMethods() {
  return await methodsRepo.getAll();
}

export async function updateMethod(method) {
  return await methodsRepo.update(method);
}

// A fulfillment carries no user of its own, so "is this yours" is a question
// about the order. requireUser alone would have let any signed-in customer read
// any order's pickup address and appointment time by changing a query string -
// the same class of hole as an unguarded route, and invisible from the routes
// file because the guard is present and simply not enough.
export async function getForOrder(order_id, { userId, isAdmin = false } = {}) {
  if (!isAdmin) {
    const owner = await fulfillmentsRepo.ownerOf(order_id);
    if (!owner || owner !== userId) return null;
  }
  return await fulfillmentsRepo.getByOrder(order_id);
}

export async function getSchedule(filters) {
  return await fulfillmentsRepo.getScheduled(filters);
}

// Choosing a method, from the customer's side. Admin callers go through the
// repo, which is why the offered-method check is here and not there: an admin
// putting an order on OWN LABEL is the reason OWN LABEL exists.
export async function choose({ order_id, method_id, direction, created_by_id }, executor) {
  const offered = await methodsRepo.getAvailable(direction, executor);
  if (!offered.some((m) => m.id === method_id)) {
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

// The default for a direction and category, for the flows that do not ask.
// A sale with nothing chosen is a DROPSHIP; a purchase with nothing chosen is a
// CARRIER DROPOFF. Both come from the seed rather than from a constant here, so
// changing the business's default is an UPDATE rather than a deploy.
export async function chooseDefault(
  { order_id, direction, category = "SHIPMENT", created_by_id },
  executor
) {
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
