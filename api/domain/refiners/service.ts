// Refiners: the refiner read, and the counterpart rows every order is born with.
import * as refiners from "#db/refiners/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as organizations from "#db/organizations/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import { counterpartLines, counterpartSpots } from "#domain/refiners/rules.ts";
import type { RefinerRow } from "#db/refiners/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { organizations as organizationTables } from "@dorado/contracts";

// A refiner IS its organization's name, email and phone plus a logo, so the two
// rows travel as one. Inner-join semantics: a refiner with no organization is
// dropped rather than answered with nulls where a caller reads a name.
export type ComposedRefiner = {
  id: string;
  logo: string | null;
  created_at: organizationTables.organizations.Row["created_at"];
  updated_at: organizationTables.organizations.Row["updated_at"];
  organization: Pick<
    organizationTables.organizations.Row, "id" | "name" | "email" | "phone" | "enabled"
  >;
};

const composed = (
  refiner: RefinerRow, organization: organizationTables.organizations.Row
): ComposedRefiner => ({
  id: refiner.id,
  logo: refiner.logo,
  // created_at/updated_at come from the ORGANIZATION, not the refiner.
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

// Sequential: no caller passes an executor here, so both default to the
// shared pool - fine when unpinned (a real connection per call), but a
// caller running inside a pinned test transaction (or a future caller that
// starts passing its own client through) puts both queries on ONE client,
// which is the same "already executing" bug as detailsFor().
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
    // Sorted on the joined name column, where the name now exists.
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

// ONE ENGAGEMENT PER ORDER. The service asks whether there is one and creates
// it when there is not, so the repo stays the five verbs.
export async function engagementIdFor(order_id: string, executor?: Executor): Promise<string> {
  const existing = await refinerOrders.findByOrder(order_id, executor);
  if (existing) return existing.id;
  return (await refinerOrders.create({ order_id }, executor)).id;
}

// THE REFINER COUNTERPART OF EVERY CUSTOMER LINE (093's invariant). Load the
// lines and what is already mirrored, derive the missing rows, write them.
// Sequential, not Promise.all: `executor` is the caller's own transaction
// client here (order creation runs inside withTransaction), and one pg
// client cannot run two statements at once - a Promise.all of two different
// tables on the same client is the exact bug detailsFor() had.
export async function mirrorLinesForOrder(order_id: string, executor?: Executor): Promise<void> {
  const refiner_order_id = await engagementIdFor(order_id, executor);
  const lines = await orderItems.getFor(order_id, executor);
  const covered = await refinerItems.getForOrder(order_id, executor);
  await refinerItems.createMany(counterpartLines(refiner_order_id, lines, covered), executor);
}

// The counterparts an order is born with: the engagement, one line per customer
// line, one cover per frozen spot. Values stay NULL until a refinery is
// actually involved.
// Sequential for the same reason as mirrorLinesForOrder above.
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
