// A carrier is an organization (type CARRIER) plus a shipping.carriers row holding the logo. Only the organizations service writes that table.
// The id is generated here (not database-default): FEDEX_CARRIER_ID (providers/shipments/constants.ts) is a literal uuid a carrier row must actually carry.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as carriers from "#db/shipping/carriers/repo.ts";
import * as organizations from "#db/organizations/repo.ts";
import * as compose from "#domain/shipping/carriers/compose.ts";
import type { ComposedCarrier } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
// The write shape is the contract's, parsed strictly at transport - the local
// copy it replaces spelled the organization's four columns a second time.
import type { CarrierPatch } from "@dorado/contracts";

export async function getAllCarriers(): Promise<ComposedCarrier[]> {
  return await compose.all(await carriers.getAll());
}

// Takes an executor because resolveCarrier is called from inside label
// creation's transaction, and a carrier created in that transaction must be
// visible to it.
export async function getCarrierById(
  id: string, executor?: Executor
): Promise<ComposedCarrier | null> {
  const row = await carriers.getOne(id, executor);
  if (!row) return null;
  return await compose.one(row, executor);
}

// "" for a carrier that does not exist, not null - the callers put this
// straight into a shipping label and a string is what they need.
export async function getCarrierName(id: string, executor?: Executor): Promise<string> {
  return (await getCarrierById(id, executor))?.organization.name ?? "";
}

// Organization is inserted before the carrier (FK). Both in one transaction - existing in one table but not the other would be invisible to getAll while still holding its id.
// A USE CASE (ruling 56): only the controller calls this, so it owns the transaction outright rather than taking one.
export async function createCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  return await withTransaction(async (tx) => {
    const id = randomUUID();
    const organization_id = randomUUID();

    await organizations.create(carrier.organization, organization_id, "CARRIER", tx);
    const row = await carriers.create({ id, organization_id, logo: carrier.logo ?? null }, tx);
    return await compose.one(row, tx);
  });
}

// Updates every field, including to null when absent - a partial update would be a behavior change, and the frontend always sends the whole carrier back.
// A USE CASE, same reasoning as createCarrier.
export async function updateCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  const id = carrier.id;
  if (!id) return null;

  return await withTransaction(async (tx) => {
    const current = await carriers.getOne(id, tx);
    if (!current) return null;

    const changed = await carriers.update(id, { logo: carrier.logo ?? null }, tx);
    if (!changed) return null;

    // Keyed by the carrier's OWN organization_id, read before the update,
    // rather than by joining organizations to carriers inside the statement.
    if (current.organization_id) {
      await organizations.update(current.organization_id, carrier.organization, tx);
    }

    const row = await carriers.getOne(id, tx);
    if (!row) return null;
    return await compose.one(row, tx);
  });
}

// The carrier row goes first because it holds the foreign key; dropping the organization first would be refused.
// Returns true unconditionally - not a report of whether anything was deleted. Changing that is a wire change.
// A USE CASE, same reasoning as createCarrier.
export async function removeCarrier(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const row = await carriers.getOne(id, tx);
    await carriers.remove(id, tx);
    if (row?.organization_id) await organizations.remove(row.organization_id, tx);
    return true;
  });
}
