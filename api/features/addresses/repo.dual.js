// Dual-write phase of the addresses migration.
//
// Every write goes to exchange and is then mirrored into places, both inside
// one transaction. Reads come from places, so it is exercised by real traffic
// while exchange stays a complete replica.
//
// The mirror re-derives the address from exchange rather than applying each
// change twice, so there is one definition of what an address looks like in the
// new schema and every write exercises it.
//
// Note what this feature is coupled to. An order returns the address-book id it
// was placed against, and the frontend posts that back at checkout for
// getFromId to resolve. Under dual, getFromId reads places.addresses - and
// because the address book keeps its exchange ids, the id an order returns
// still resolves. That is not a coincidence; it is why the ids were kept.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/addresses/repo.exchange.js";
import * as next from "#features/addresses/repo.next.js";

export const list = next.list;
export const getFromId = next.getFromId;
export const isActive = next.isActive;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export const create = (args, executor) =>
  both(executor, async (c) => {
    const created = await exchange.create(args, c);
    await next.mirrorAddress(created.id, c);
    return created;
  });

export const update = (args, executor) =>
  both(executor, async (c) => {
    const updated = await exchange.update(args, c);
    if (updated) await next.mirrorAddress(updated.id, c);
    return updated;
  });

export const updateValidation = (args, executor) =>
  both(executor, async (c) => {
    const updated = await exchange.updateValidation(args, c);
    if (updated) await next.mirrorAddress(updated.id, c);
    return updated;
  });

// setDefault turns one address on and every other of that user's off, so the
// whole book has to be re-mirrored rather than the one row that was named.
export const setDefault = ({ userId, addressId }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.setDefault({ userId, addressId }, c);
    await next.mirrorUserAddresses(userId, c);
    return r;
  });

// Removal is the one write where the two schemas deliberately differ. Deleting
// an address from exchange deletes the row outright; here the user's link to it
// goes, but the postal address survives if an order snapshot still points at
// it. An address someone removed from their book has not stopped being the
// place a parcel was actually sent, and the order has to keep saying where it
// went.
export const remove = ({ addressId, userId }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.remove({ addressId, userId }, c);
    await next.removeAddress(addressId, c);
    return r;
  });
