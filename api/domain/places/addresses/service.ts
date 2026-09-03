// Addresses: the address row and one person's link to it, written together.
// THE OWNERSHIP CHECK MOVED HERE: places.addresses has no user_id, so the write can't refuse a stranger's address by itself - this file must, by reading the caller's link first inside the same transaction as the write. Without it any signed-in customer could rewrite any address by id.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as compose from "#domain/places/addresses/compose.ts";
import type { ComposedAddress } from "#domain/places/addresses/compose.ts";
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { UserAddressRow } from "#db/places/user-addresses/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import { Conflict, NotFound } from "#shared/errors.ts";

// req.body's two halves. The relationship arrives BESIDE the address, never inside it - one call, one transaction, but two things.
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

// The link row as compose() wants it, with default_shipping forced true for the response - setDefault already wrote the flag, this just avoids a second read.
function asDefault(link: UserAddressRow): UserAddressRow {
  return {
    id: link.id,
    address_id: link.address_id,
    user_id: link.user_id,
    label: link.label,
    default_shipping: true,
    default_billing: link.default_billing,
  };
}

const labelOf = (ua?: UserAddressInput): string | null => ua?.label ?? null;
const defaultOf = (ua?: UserAddressInput): boolean => ua?.default_shipping === true;

// ---------------------------------------------------------------------- reads

export async function list(userId: string, executor?: Executor): Promise<ComposedAddress[]> {
  const links = await userAddresses.listFor(userId, executor);
  const rows = await addresses.getMany(links.map((l) => l.address_id), executor);
  return compose.all(links, rows);
}

// Returns a list, not an oversight - an address can be in more than one person's book, so a list is the honest answer.
export async function getFromId(
  address_id: string, executor?: Executor
): Promise<ComposedAddress[]> {
  const row = await addresses.getOne(address_id, executor);
  if (!row) return [];
  const links = await userAddresses.getByAddress(address_id, executor);
  return compose.all(links, [row]);
}

// payments/service.ts calls this to find the state a sales order is taxed in.
// `import * as` makes a missing name undefined rather than an import error - a deleted function here fails at the call, not at build time.
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

// The order-time freeze: copy the address as it stands and hand back the copy's id. Owned here because places.addresses is this feature's table.
export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  return await addresses.snapshot(address_id, executor);
}

// The ownership question - different from isActive above (whether an unfinished order LOCKS the address). Checkout's address slots are gated on this.
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
  const label = labelOf(user_address);
  const isDefault = defaultOf(user_address);

  const run = async (c: Executor): Promise<ComposedAddress> => {
    const id = randomUUID();
    const row = await addresses.create(id, address, c);
    // Creating AS the default must also un-default the others: insert off, then flip through the same clear-then-set both writes use.
    const link = await userAddresses.create(randomUUID(), id, userId, { label, default_shipping: false }, c);
    if (isDefault) {
      await userAddresses.setDefault(userId, id, c);
      return compose.compose(row, asDefault(link));
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
    throw new Conflict(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const label = labelOf(user_address);
  const isDefault = defaultOf(user_address);

  const run = async (c: Executor): Promise<ComposedAddress> => {
    // The ownership check (see header). Read inside the transaction, so an address that leaves the caller's book between this and the write can't slip through.
    const owned = await userAddresses.getOne(address.id, userId, c);
    if (!owned) throw new NotFound("Address not found.");

    // The address, unchanged, plus is_residential reset to false - the one fact this write adds that the caller didn't send.
    const ok = await addresses.update(address.id, {
      line_1: address.line_1,
      line_2: address.line_2,
      city: address.city,
      state: address.state,
      country: address.country,
      zip: address.zip,
      country_code: address.country_code,
      phone_number: address.phone_number,
      is_residential: false,
    }, c);
    if (!ok) throw new NotFound("Address not found.");
    const row = await addresses.getOne(address.id, c) as AddressRow;

    // Same one-default rule as create: turning the flag ON goes through clear-then-set rather than writing a second default beside the existing one.
    const link = await userAddresses.update(address.id, userId, { label, default_shipping: false }, c);
    if (isDefault) {
      await userAddresses.setDefault(userId, address.id, c);
      return compose.compose(row, asDefault(link ?? owned));
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
    const ok = await addresses.update(addressId, { is_valid, is_residential }, c);
    if (!ok) return undefined;
    const row = await addresses.getOne(addressId, c) as AddressRow;
    const links = await userAddresses.getByAddress(addressId, c);
    return links[0] ? compose.compose(row, links[0]) : undefined;
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Returns a message string, not the row or a boolean - that's what the controller sends back.
export async function remove(
  { addressId, userId }: { addressId: string; userId: string },
  executor?: Executor
): Promise<string> {
  if (await addresses.isActive(addressId, userId, executor)) {
    throw new Conflict(
      "Address cannot be deleted because it is associated with an active order."
    );
  }

  const run = async (c: Executor): Promise<string> => {
    // The LINK goes first - the address itself only goes when nothing at all points at it (an order snapshot may still reference it).
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
