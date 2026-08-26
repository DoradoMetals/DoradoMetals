// Dual-write phase of the carrier-services schema migration.
//
// Writes go to exchange.carrier_services and are mirrored into
// shipping.services in the same transaction. Reads come from the new table.
//
// The mirror is keyed on (carrier_id, name), not on id, and the reason is
// worth stating plainly: the two tables have never agreed about ids and were
// never going to. 047 seeds shipping.services from a dev snapshot, production's
// exchange rows carry entirely different ids, and in dev one id belongs to
// 'Overnight' on one side and 'Priority Overnight' on the other. Nothing
// references exchange.carrier_services.id - no foreign key to it exists in dev
// or production - so this costs nothing. What does resolve a service is its
// name: 049's mirrorShipment already turns exchange.shipments.service_type into
// shipping.shipments.carrier_service_id by looking up (carrier_id, name), and
// all 23 dev shipments agree name-for-name across both schemas.
// 053 makes that pair unique so the lookup cannot become ambiguous.
//
// Gate on `pnpm --filter @dorado/api diff services` before promoting.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/shipping/services/repo.exchange.js";
import * as next from "#features/shipping/services/repo.next.ts";

export const getAll = next.getAll;
export const getById = next.getById;
export const getByCarrierId = next.getByCarrierId;

const both = (client, fn) => (client ? fn(client) : withTransaction(fn));

export async function create(service, client) {
  return both(client, async (c) => {
    const written = await exchange.create(service, c);
    await next.mirrorService(written.id, c);
    return written;
  });
}

// The old pair is read before the write, because update() may change the name
// and the mirror is keyed on it. Renaming first moves the existing row onto the
// new pair; mirrorService then fills in the rest of the columns.
export async function update(service, client) {
  return both(client, async (c) => {
    const before = await exchange.getById(service.id, c);
    const written = await exchange.update(service, c);
    if (before) {
      await next.renamePair(
        { carrier_id: before.carrier_id, name: before.name },
        { carrier_id: written.carrier_id, name: written.name },
        c
      );
    }
    await next.mirrorService(written.id, c);
    return written;
  });
}

// Deletes from both, which can legitimately fail.
//
// shipping.shipments.carrier_service_id references shipping.services with no
// ON DELETE clause, so removing a service that shipments still point at is
// refused and the whole transaction - including the exchange delete - rolls
// back. exchange has no such foreign key and would have allowed it, leaving
// those shipments holding a service_type string naming a service that no longer
// exists.
//
// That is a behaviour change and it is the right one, because there is no
// working behaviour to preserve: this endpoint has never succeeded. The
// controller passed the whole request body where the repo expected an id, so
// every call died on `invalid input syntax for type uuid`. Fixed alongside this
// split, which is what makes the path reachable at all.
export async function remove(id, client) {
  return both(client, async (c) => {
    const row = await exchange.getById(id, c);
    await exchange.remove(id, c);
    if (row) await next.removeByPair(row.carrier_id, row.name, c);
    return true;
  });
}
