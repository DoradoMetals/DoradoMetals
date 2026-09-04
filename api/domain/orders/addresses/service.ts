// GET /api/orders/:id/address - the places.addresses row the parcel went to.
//
// The chain is resolved SERVER-SIDE, in the WHERE clause (ruling 12): the link
// row is not part of the answer. NO WRITE, and not meant to be one - an order's
// address snapshot is immutable (Jacob, D84).
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderAddressLink } from "@dorado/contracts";

// Null when the order has no address link - a real state for most dev orders;
// the controller turns it into a 404.
export async function snapshotFor(
  orderId: string, executor?: Executor
): Promise<Awaited<ReturnType<typeof placeAddresses.getOne>> | null> {
  const link = await orderAddresses.getFor(orderId, executor);
  if (!link) return null;
  return (await placeAddresses.getOne(link.address_id, executor)) ?? null;
}
