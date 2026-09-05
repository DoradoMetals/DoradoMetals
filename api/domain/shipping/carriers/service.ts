import withTransaction from "#shared/db/withTransaction.ts";
import * as carriers from "#db/shipping/carriers/repo.ts";
import * as organizations from "#db/organizations/repo.ts";
import * as compose from "#domain/shipping/carriers/compose.ts";
import type { ComposedCarrier } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import type { CarrierPatch } from "@dorado/contracts";

export async function getAllCarriers(): Promise<ComposedCarrier[]> {
  return await compose.all(await carriers.getAll());
}

export async function getCarrierById(
  id: string, executor?: Executor
): Promise<ComposedCarrier | null> {
  const row = await carriers.getOne(id, executor);
  if (!row) return null;
  return await compose.one(row, executor);
}

export async function getCarrierName(id: string, executor?: Executor): Promise<string> {
  return (await getCarrierById(id, executor))?.organization.name ?? "";
}

export async function createCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  return await withTransaction(async (tx) => {
    const organization = await organizations.create(carrier.organization, "CARRIER", tx);
    const row = await carriers.create(
      { organization_id: organization.id, logo: carrier.logo ?? null }, tx
    );
    return await compose.one(row, tx);
  });
}

export async function updateCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  const id = carrier.id;
  if (!id) return null;

  return await withTransaction(async (tx) => {
    const current = await carriers.getOne(id, tx);
    if (!current) return null;

    const changed = await carriers.update(id, { logo: carrier.logo ?? null }, tx);
    if (!changed) return null;

    if (current.organization_id) {
      await organizations.update(current.organization_id, carrier.organization, tx);
    }

    const row = await carriers.getOne(id, tx);
    if (!row) return null;
    return await compose.one(row, tx);
  });
}

export async function removeCarrier(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const row = await carriers.getOne(id, tx);
    await carriers.remove(id, tx);
    if (row?.organization_id) await organizations.remove(row.organization_id, tx);
    return true;
  });
}
