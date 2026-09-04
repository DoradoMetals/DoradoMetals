import * as refiners from "#db/refiners/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as organizations from "#db/organizations/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import { counterpartLines, counterpartSpots } from "#domain/refiners/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Organization, Refiner } from "@dorado/contracts";

export type ComposedRefiner = {
  id: string;
  logo: string | null;
  created_at: Organization["created_at"];
  updated_at: Organization["updated_at"];
  organization: Pick<
    Organization, "id" | "name" | "email" | "phone" | "enabled"
  >;
};

const composed = (
  refiner: Refiner, organization: Organization
): ComposedRefiner => ({
  id: refiner.id,
  logo: refiner.logo,
  created_at: organization.created_at,
  updated_at: organization.updated_at,
  organization: {
    id: organization.id,
    name: organization.name,
    email: organization.email,
    phone: organization.phone,
    enabled: organization.enabled,
  },
});

export async function getAllRefiners(): Promise<ComposedRefiner[]> {
  const rows = await refiners.list();
  const byId = await organizations.byId();
  return rows
    .flatMap((refiner) => {
      const organization = refiner.organization_id === null
        ? undefined
        : byId.get(refiner.organization_id);
      return organization ? [composed(refiner, organization)] : [];
    })
    .sort((a, b) =>
      (a.organization.name ?? "").localeCompare(b.organization.name ?? "") ||
      a.id.localeCompare(b.id)
    );
}

export async function getRefinerFromId(id: string): Promise<ComposedRefiner | null> {
  const refiner = await refiners.getOne(id);
  if (!refiner?.organization_id) return null;
  const organization = await organizations.getOne(refiner.organization_id);
  return organization ? composed(refiner, organization) : null;
}

export async function engagementIdFor(order_id: string, executor?: Executor): Promise<string> {
  const existing = await refinerOrders.findByOrder(order_id, executor);
  if (existing) return existing.id;
  return (await refinerOrders.create({ order_id }, executor)).id;
}

export async function mirrorLinesForOrder(order_id: string, executor?: Executor): Promise<void> {
  const refiner_order_id = await engagementIdFor(order_id, executor);
  const lines = await orderItems.getFor(order_id, executor);
  const covered = await refinerItems.getForOrder(order_id, executor);
  await refinerItems.createMany(counterpartLines(refiner_order_id, lines, covered), executor);
}

export async function mirrorForOrder(order_id: string, executor?: Executor): Promise<void> {
  const refiner_order_id = await engagementIdFor(order_id, executor);

  const lines = await orderItems.getFor(order_id, executor);
  const mirroredLines = await refinerItems.getForOrder(order_id, executor);
  const frozen = await orderSpots.getRowsFor(order_id, executor);
  const coveredSpots = await refinerSpots.getForEngagement(refiner_order_id, executor);

  await refinerItems.createMany(
    counterpartLines(refiner_order_id, lines, mirroredLines), executor
  );
  await refinerSpots.createMany(
    counterpartSpots(refiner_order_id, frozen, coveredSpots), executor
  );
}
