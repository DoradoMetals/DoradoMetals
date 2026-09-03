// A carrier is an organization (type CARRIER) plus a shipping.carriers row holding the logo. Only the organizations service writes that table.
// The id is generated here (not database-default): FEDEX_CARRIER_ID (providers/shipments/constants.ts) is a literal uuid a carrier row must actually carry.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as carriers from "#db/shipping/carriers/repo.ts";
import * as organizations from "#db/organizations/repo.ts";
import * as compose from "#domain/shipping/carriers/compose.ts";
import type { ComposedCarrier } from "#domain/shipping/carriers/compose.ts";
import type { Executor } from "#shared/db/executor.ts";

// What a caller supplies, as req.body - every field optional.
// organization's shape matches organizations.OrganizationPatch: name/enabled are NOT NULL columns, so stay non-nullable here; email/phone are the two that can be null.
type CarrierInput = {
  id?: string;
  logo?: string | null;
  organization?: {
    name?: string; email?: string | null;
    phone?: string | null; enabled?: boolean;
  };
};

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
export async function createCarrier(
  carrier: CarrierInput, executor?: Executor
): Promise<ComposedCarrier | null> {
  const run = async (c: Executor): Promise<ComposedCarrier | null> => {
    const id = randomUUID();
    const organization_id = randomUUID();

    await organizations.create(carrier.organization, organization_id, "CARRIER", c);
    const row = await carriers.create({ id, organization_id, logo: carrier.logo ?? null }, c);
    return await compose.one(row, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Updates every field, including to null when absent - a partial update would be a behavior change, and the frontend always sends the whole carrier back.
export async function updateCarrier(
  carrier: CarrierInput, executor?: Executor
): Promise<ComposedCarrier | null> {
  const id = carrier.id;
  if (!id) return null;

  const run = async (c: Executor): Promise<ComposedCarrier | null> => {
    const current = await carriers.getOne(id, c);
    if (!current) return null;

    const changed = await carriers.update(id, { logo: carrier.logo ?? null }, c);
    if (!changed) return null;

    // Keyed by the carrier's OWN organization_id, read before the update,
    // rather than by joining organizations to carriers inside the statement.
    if (current.organization_id) {
      await organizations.update(current.organization_id, carrier.organization, c);
    }

    const row = await carriers.getOne(id, c);
    if (!row) return null;
    return await compose.one(row, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The carrier row goes first because it holds the foreign key; dropping the organization first would be refused.
// Returns true unconditionally - not a report of whether anything was deleted. Changing that is a wire change.
export async function removeCarrier(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    const row = await carriers.getOne(id, c);
    await carriers.remove(id, c);
    if (row?.organization_id) await organizations.remove(row.organization_id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
