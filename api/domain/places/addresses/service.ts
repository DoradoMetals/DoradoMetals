// Addresses: two rows in the new schema, one row in exchange, written together.
//
// THE OWNERSHIP CHECK MOVED HERE, AND THAT IS THE ONE THING TO GET RIGHT.
//
// exchange scoped its writes in the statement - `WHERE id = $1 AND user_id =
// $2` - because the address carried its owner. places.addresses does not have a
// user_id; whose book an address is in is places.user_addresses. So the
// statement cannot refuse a stranger's address and this file has to, by reading
// the caller's link first, inside the same transaction as the write.
//
// Without that check any signed-in customer could rewrite any address by id.
// The exchange statement is still scoped, so the damage would have been
// one-sided - the new schema changed and exchange not - which is worse than
// either, because the two schemas would then disagree about someone's address
// and nothing reads the new one yet to notice.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as compose from "#domain/places/addresses/compose.ts";
import type { ComposedAddress } from "#domain/places/addresses/compose.ts";
import type { AddressValues } from "#db/places/addresses/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

// req.body's two halves. The relationship arrives BESIDE the address, never
// inside it - one call, one transaction, but two things (2026-08-27).
export type AddressInput = {
  id?: string;
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  country_code?: string | null;
  phone_number?: string | null;
};

type UserAddressInput = {
  label?: string | null;
  default_shipping?: boolean | null;
};

const toValues = (a: AddressInput): AddressValues => [
  a.line_1 ?? null,
  a.line_2 ?? null,
  a.city ?? null,
  a.state ?? null,
  a.country ?? null,
  a.zip ?? null,
  a.country_code ?? null,
  a.phone_number ?? null,
];

const labelOf = (ua?: UserAddressInput): string | null => ua?.label ?? null;
const defaultOf = (ua?: UserAddressInput): boolean => ua?.default_shipping === true;

// ---------------------------------------------------------------------- reads

export async function list(userId: string, executor?: Executor): Promise<ComposedAddress[]> {
  const links = await userAddresses.getForUser(userId, executor);
  const rows = await addresses.getMany(links.map((l) => l.address_id), executor);
  return compose.all(links, rows);
}

// RETURNS A LIST, and that is not an oversight - exchange's getFromId did too,
// and callers take [0]. An address can be in more than one person's book now,
// so a list is also the honest answer rather than a leftover.
export async function getFromId(
  address_id: string, executor?: Executor
): Promise<ComposedAddress[]> {
  const row = await addresses.getOne(address_id, executor);
  if (!row) return [];
  const links = await userAddresses.getByAddress(address_id, executor);
  return compose.all(links, [row]);
}

// ONE ADDRESS BY ID, WHICH THIS SERVICE HAD NOT EXPOSED SINCE 26 DECEMBER 2025.
//
// features/payments/service.ts calls getAddressFromId to find the state a sales
// order is taxed in. The function did not exist - it was lost in be03eed3 and
// nothing defined it since, and `import * as` makes a missing name `undefined`
// rather than an import error, so it failed at the call. The effect was that
// POST /api/stripe/update_payment_intent threw on its first await and answered
// 500 every time, leaving the intent at the $10.00 placeholder.
export async function getAddressFromId(
  address_id: string, executor?: Executor
): Promise<ComposedAddress | undefined> {
  return (await getFromId(address_id, executor))[0];
}

export async function isActive(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  return await addresses.isActive(address_id, user_id, executor);
}

// The order-time freeze (D208): copy the address as it stands and hand back
// the copy's id. Owned here because places.addresses is this feature's table -
// an order links to the snapshot through its own orders.addresses repo.
export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  return await addresses.snapshot(address_id, executor);
}

// WHETHER AN ADDRESS IS IN THIS USER'S BOOK - the ownership question, which
// is a different question from isActive above (that one asks whether an
// unfinished order LOCKS the address). The checkout row's address slots are
// gated on this: an id from somebody else's book never lands (D208).
export async function inBook(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const links = await userAddresses.getByAddress(address_id, executor);
  return links.some((l) => l.user_id === user_id);
}

// --------------------------------------------------------------------- writes

export async function create(
  { address, user_address, userId }:
    { address: AddressInput; user_address?: UserAddressInput; userId: string },
  executor?: Executor
): Promise<ComposedAddress> {
  const values = toValues(address);
  const label = labelOf(user_address);
  const isDefault = defaultOf(user_address);

  const run = async (c: Executor): Promise<ComposedAddress> => {
    const id = randomUUID();
    const row = await addresses.create(id, values, c);
    // Creating AS the default must also un-default the others. Only
    // setDefault ever cleared them, so a second create with the flag left a
    // user with two defaults and the UI showing a coin toss - a live bug
    // migration 089's one-default-per-user index surfaced the day it landed.
    // Insert off, then flip through the same clear-then-set both writes use.
    const link = await userAddresses.create(randomUUID(), id, userId, label, false, c);
    if (isDefault) {
      await userAddresses.setDefault(userId, id, c);
      return compose.compose(row, { ...link, default_shipping: true });
    }
    return compose.compose(row, link);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function update(
  { address, user_address, userId }:
    { address: AddressInput & { id: string }; user_address?: UserAddressInput; userId: string },
  executor?: Executor
): Promise<ComposedAddress> {
  if (await addresses.isActive(address.id, userId, executor)) {
    throw badRequest(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const values = toValues(address);
  const label = labelOf(user_address);
  const isDefault = defaultOf(user_address);

  const run = async (c: Executor): Promise<ComposedAddress> => {
    // THE OWNERSHIP CHECK. See the header. Read inside the transaction, so an
    // address that leaves the caller's book between this and the write cannot
    // slip through.
    const owned = await userAddresses.getOne(address.id, userId, c);
    if (!owned) throw badRequest("Address not found.");

    const row = await addresses.update(address.id, values, c);
    if (!row) throw badRequest("Address not found.");

    // Same one-default rule as create: an update that turns the flag ON goes
    // through clear-then-set rather than writing a second default beside the
    // existing one (089's index refuses that, correctly).
    const link = await userAddresses.update(address.id, userId, label, false, c);
    if (isDefault) {
      await userAddresses.setDefault(userId, address.id, c);
      return compose.compose(row, { ...(link ?? owned), default_shipping: true });
    }
    return compose.compose(row, link ?? owned);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function updateValidation(
  { addressId, is_valid, is_residential }:
    { addressId: string; is_valid: boolean; is_residential: boolean },
  executor?: Executor
): Promise<ComposedAddress | undefined> {
  const run = async (c: Executor): Promise<ComposedAddress | undefined> => {
    const row = await addresses.updateValidation(addressId, is_valid, is_residential, c);
    if (!row) return undefined;
    const links = await userAddresses.getByAddress(addressId, c);
    return links[0] ? compose.compose(row, links[0]) : undefined;
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Returns a MESSAGE STRING, not the row and not a boolean - that is what the
// controller sends back, so it is what this returns.
export async function remove(
  { addressId, userId }: { addressId: string; userId: string },
  executor?: Executor
): Promise<string> {
  if (await addresses.isActive(addressId, userId, executor)) {
    throw badRequest(
      "Address cannot be deleted because it is associated with an active order."
    );
  }

  const run = async (c: Executor): Promise<string> => {
    // The LINK goes first. places.addresses may still be referenced by an order
    // snapshot, and an address that is gone from someone's book has not stopped
    // being the place a parcel was sent - so the address itself only goes when
    // nothing at all points at it.
    await userAddresses.remove(addressId, userId, c);
    if (!(await addresses.isReferenced(addressId, c))) {
      await addresses.remove(addressId, c);
    }
    return "Deleted address.";
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function setDefault(
  { userId, addressId }: { userId: string; addressId: string },
  executor?: Executor
): Promise<string> {
  const run = async (c: Executor): Promise<string> => {
    await userAddresses.setDefault(userId, addressId, c);
    return "Set default address.";
  };
  return executor ? await run(executor) : await withTransaction(run);
}
