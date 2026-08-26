// Dual-write phase of the shipments migration.
//
// Every write goes to exchange and the shipment is then re-derived into the
// shipping schema inside the same transaction, so both hold the same shipment
// and falling back to exchange loses nothing.
//
// A shipment is three rows here - itself, the fulfillment that says which
// order it belongs to, and the link recording which of our locations handled
// it - so `create` has more to do on the new side than on the old. The mirror
// does all three from one exchange row rather than the caller knowing about
// any of it.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/shipping/shipments/repo.exchange.js";
import * as next from "#features/shipping/shipments/repo.next.ts";

export const getAll = next.getAll;
export const getById = next.getById;
export const getByOrder = next.getByOrder;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export const create = (shipment, client) =>
  both(client, async (c) => {
    const created = await exchange.create(shipment, c);
    if (created?.id) await next.mirrorShipment(created.id, c);
    return created;
  });

export const update = (shipment, client) =>
  both(client, async (c) => {
    const updated = await exchange.update(shipment, c);
    if (updated?.id) await next.mirrorShipment(updated.id, c);
    return updated;
  });

// The order matters: exchange is deleted first so the mirror's own guard -
// "remove what exchange no longer has" - is true by the time it runs.
export const remove = (id, client) =>
  both(client, async (c) => {
    const result = await exchange.remove(id, c);
    await next.removeShipment(id, c);
    return result;
  });
