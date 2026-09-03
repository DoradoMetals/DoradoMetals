// THE ORDER'S ADDRESS SNAPSHOT, as its own resource (ruling 26c).
//
//   GET /api/orders/:id/address   the places.addresses row the parcel went to
//
// THE CHAIN IS RESOLVED SERVER-SIDE, IN THE WHERE CLAUSE (ruling 12), which is
// what lets this answer with a row of one table rather than a link plus a
// nesting: orders.addresses names the snapshot, this reads it. Nothing nests on
// the wire - the link row itself is not part of the answer.
//
// An order snapshot is immutable (Jacob, D84): "order addresses are immutable".
// So there is no write here and there is not meant to be one - the snapshot is
// taken at checkout by the create path and never edited afterwards.
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderAddressRow } from "#db/orders/addresses/repo.ts";

// Null when the order has no address link - 43 of dev's 63 orders are in that
// state, which is a real answer about a resource that does not exist, and the
// controller turns it into a 404.
export async function snapshotFor(
  orderId: string, executor?: Executor
): Promise<Awaited<ReturnType<typeof placeAddresses.getOne>> | null> {
  const link = await orderAddresses.getFor(orderId, executor);
  if (!link) return null;
  return (await placeAddresses.getOne(link.address_id, executor)) ?? null;
}
