// Dual-write phase of the carrier-pickups schema migration.
//
// Writes go to exchange.carrier_pickups and are mirrored into shipping.pickups
// in the same transaction. Reads come from the new table.
//
// The mirror can silently write nothing, and that is deliberate.
// shipping.pickups.shipment_id is NOT NULL while exchange records only an
// order, so the shipment has to be resolved through exchange.shipments; if the
// order has no shipment yet, there is nothing to hang the pickup off. Failing
// the caller's transaction over that would mean a mirror could break a live
// purchase order - the exact path that has been throwing since January. So the
// mirror reports whether it wrote, and the exchange row stands either way.
//
// In practice it always resolves in the flow that creates pickups:
// purchase-orders/service.js writes the shipment first and books the pickup
// after, in the same transaction.
//
// Gate on `pnpm --filter @dorado/api diff pickups` before promoting.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/shipping/pickups/repo.exchange.js";
import * as next from "#features/shipping/pickups/repo.next.ts";

export const getAll = next.getAll;
export const getById = next.getById;
export const getByOrder = next.getByOrder;

const both = (client, fn) => (client ? fn(client) : withTransaction(fn));

export async function create(pickup, client) {
  return both(client, async (c) => {
    const written = await exchange.create(pickup, c);
    if (written) await next.mirrorPickup(written.id, c);
    return written;
  });
}

export async function update(pickup, client) {
  return both(client, async (c) => {
    const written = await exchange.update(pickup, c);
    if (written) await next.mirrorPickup(written.id, c);
    return written;
  });
}

export async function remove(id, client) {
  return both(client, async (c) => {
    await exchange.remove(id, c);
    await next.remove(id, c);
    return true;
  });
}
