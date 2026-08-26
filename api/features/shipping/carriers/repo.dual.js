// Dual-write phase of the carriers schema migration.
//
// Writes go to exchange and are mirrored into organizations + shipping.carriers,
// all inside one transaction. Reads come from the new tables.
//
// The mirror creates or updates two rows, and does so server-side from
// exchange, so the id and every timestamp match by construction rather than by
// a JS round trip that would truncate them to milliseconds.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/shipping/carriers/repo.exchange.js";
import * as next from "#features/shipping/carriers/repo.next.ts";

export const getAll = next.getAll;
export const getById = next.getById;
export const getNameById = next.getNameById;

const both = (client, fn) => (client ? fn(client) : withTransaction(fn));

export async function create(carrier, client) {
  return both(client, async (c) => {
    const written = await exchange.create(carrier, c);
    await next.mirrorCarrier(written.id, c);
    return written;
  });
}

export async function update(carrier, client) {
  return both(client, async (c) => {
    const written = await exchange.update(carrier, c);
    await next.mirrorCarrier(written.id, c);
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
