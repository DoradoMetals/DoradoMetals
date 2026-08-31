// Carriers: two rows in the new schema, one row in exchange, written together.
//
// A carrier is an organization of type CARRIER plus a shipping.carriers row
// holding the logo. The organization half is written through the organizations
// service, which is the only thing that writes that table - the update this
// replaces was a statement against organizations.organizations that had to JOIN
// shipping.carriers to find the row it wanted.
//
// THE ID IS GENERATED HERE, AND THAT IS THE POINT OF THIS FILE.
// FEDEX_CARRIER_ID in providers/shipments/constants.ts is a literal uuid and
// exchange.shipments.carrier_id references it, so a carrier's id must be the
// same value in both schemas. The dual write this replaces got that by
// inserting into exchange first and mirroring the row back out server-side;
// generating it up front is the same guarantee without the round trip, and it
// is what lets the new schema be written first.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as carriers from "#features/shipping/carriers/repo.ts";
import * as legacy from "#legacy/shipping/carriers/repo.ts";
import * as organizations from "#features/organizations/repo.ts";
import * as compose from "#features/shipping/carriers/compose.ts";
import type { ComposedCarrier } from "#features/shipping/carriers/compose.ts";
import type { Executor } from "#shared/db/executor.ts";

// What a caller supplies. This arrives as req.body, so every field is optional
// and the queries pass undefined through as null - the same latitude the
// implementation it replaces had.
type CarrierInput = {
  id?: string;
  logo?: string | null;
  organization?: {
    name?: string | null; email?: string | null;
    phone?: string | null; enabled?: boolean | null;
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

// The organization is inserted before the carrier because shipping.carriers
// references it. Both, plus the exchange row, are one transaction: a carrier
// that existed in one table and not the other would be invisible to getAll
// while still holding its id.
export async function createCarrier(
  carrier: CarrierInput, executor?: Executor
): Promise<ComposedCarrier | null> {
  const run = async (c: Executor): Promise<ComposedCarrier | null> => {
    const id = randomUUID();
    const organization_id = randomUUID();

    await organizations.create(organization_id, "CARRIER", carrier.organization ?? {}, c);
    const row = await carriers.create(id, organization_id, carrier.logo ?? null, c);

    // exchange.carriers keeps both halves on one row, and is still the record
    // of truth until carriers is promoted. `enabled` is `is_active` there.
    await legacy.create(id, { ...carrier.organization, logo: carrier.logo }, c);

    return await compose.one(row, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Updates every field, including to null when one is absent - exactly what the
// statement it replaces did. A partial update would be a behaviour change, and
// the frontend sends the whole carrier back.
export async function updateCarrier(
  carrier: CarrierInput, executor?: Executor
): Promise<ComposedCarrier | null> {
  const id = carrier.id;
  if (!id) return null;

  const run = async (c: Executor): Promise<ComposedCarrier | null> => {
    const row = await carriers.update(id, carrier.logo ?? null, c);
    if (!row) return null;

    // Keyed by the carrier's OWN organization_id, read back from the row above,
    // rather than by joining organizations to carriers inside the statement.
    if (row.organization_id) {
      await organizations.update(row.organization_id, carrier.organization ?? {}, c);
    }
    await legacy.update(id, { ...carrier.organization, logo: carrier.logo }, c);

    return await compose.one(row, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The carrier row goes first because it holds the foreign key; dropping the
// organization first would be refused.
//
// Returns true unconditionally, exactly as the implementation it replaces did -
// it is not a report of whether anything was deleted, and the route answers
// `true` either way. Changing that is a wire change.
export async function removeCarrier(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    const row = await carriers.getOne(id, c);
    await carriers.remove(id, c);
    if (row?.organization_id) await organizations.remove(row.organization_id, c);
    await legacy.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
