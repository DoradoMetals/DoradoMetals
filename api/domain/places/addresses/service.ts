// THE ADDRESS BOOK. An address row and one person's link to it, written
// together, in one transaction, because half of either is not an address.
//
// LOAD -> ASSERT -> WRITE -> AFTER. Every refusal is a named assert in
// rules.ts (ruling 65) and every write opens exactly one withTransaction
// (ruling 56); nothing here catches, logs, or spreads.
//
// THE OWNERSHIP CHECK IS THIS FILE'S: places.addresses has no user_id, so the
// write cannot refuse a stranger's address by itself. `rules.assertInBook` is
// read INSIDE the write's transaction, so an address that leaves the caller's
// book between the check and the write cannot slip through.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as rules from "#domain/places/addresses/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  Address, AddressBookEntry, AddressPatch, UserAddressPatch,
} from "@dorado/contracts";

export type Subject = { userId: string };
export type Write = Subject & { address?: AddressPatch; user_address?: UserAddressPatch };

// ---------------------------------------------------------------------- reads

// THE BOOK, WHOLE. Three statements for any number of entries: the links, the
// addresses they point at, and which of them an unfinished order has locked.
export async function list(
  userId: string, executor?: Executor
): Promise<AddressBookEntry[]> {
  const links = await userAddresses.listFor(userId, executor);
  const ids = links.map((l) => l.address_id);
  const rows = await addresses.getMany(ids, executor);
  const locked = new Set(await addresses.activeAmong(ids, userId, executor));

  const byId = new Map(rows.map((a) => [a.id, a]));
  const out: AddressBookEntry[] = [];
  for (const link of links) {
    const address = byId.get(link.address_id);
    // An address whose row has gone is dropped rather than composed with
    // undefined - the link is the book, the row is what it points at.
    if (address) out.push(rules.entry(address, link, locked.has(address.id)));
  }
  return out.sort(rules.byDefaultThenRecipient);
}

// ONE ENTRY, WHOLE. 404 when the address is not in this person's book, which is
// also what "no such address" answers - naming an address you cannot see must
// not tell you it exists.
export async function getOne(
  addressId: string, userId: string, executor?: Executor
): Promise<AddressBookEntry> {
  const link = rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, executor));
  const address = rules.assertAddress(addressId, await addresses.getOne(addressId, executor));
  return rules.entry(address, link, await addresses.isActive(addressId, userId, executor));
}

// The postal row alone, for the callers that only want the state a quote is
// taxed in. A list would be the honest answer to "whose book is this in"; this
// question is about the place, so the place is the answer.
export async function getAddressFromId(
  address_id: string, executor?: Executor
): Promise<Address | undefined> {
  return await addresses.getOne(address_id, executor);
}

// Whether an unfinished order LOCKS the address. Read by checkout, which must
// not let a parcel's destination be edited out from under it.
export async function isActive(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  return await addresses.isActive(address_id, user_id, executor);
}

// The ownership question, which is a different one. Checkout's address slots
// are gated on this.
export async function inBook(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const links = await userAddresses.getByAddress(address_id, executor);
  return links.some((l) => l.user_id === user_id);
}

// The order-time freeze: copy the address as it stands and hand back the
// copy's id. Owned here because places.addresses is this feature's table.
export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  return await addresses.snapshot(address_id, executor);
}

// --------------------------------------------------------------------- writes

export async function create({ address, user_address, userId }: Write): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const size = (await userAddresses.listFor(userId, tx)).length;
    const id = randomUUID();
    const row = await addresses.create(id, address ?? {}, tx);
    const link = await userAddresses.create(
      randomUUID(), id, userId, rules.linkColumns(user_address), tx
    );

    // THE FIRST ADDRESS IS THE DEFAULT whatever the caller asked for
    // (rules.defaultOnCreate) - a book with no default is one checkout cannot
    // preselect from. The flag is written through clear-then-mark rather than
    // in the INSERT, so two defaults cannot exist even for one statement.
    if (!rules.defaultOnCreate(size, user_address?.default_shipping)) {
      return rules.entry(row, link, false);
    }
    await userAddresses.setDefault(userId, id, tx);
    return rules.entry(row, rules.assertInBook(id, await userAddresses.getOne(id, userId, tx)), false);
  });
}

export async function update(
  addressId: string, { address, user_address, userId }: Write
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, tx));
    rules.assertNotOnAnActiveOrder(await addresses.isActive(addressId, userId, tx), "edited");

    const row = address
      ? rules.assertAddress(addressId, await addresses.update(addressId, rules.editedColumns(address), tx))
      : rules.assertAddress(addressId, await addresses.getOne(addressId, tx));
    await userAddresses.update(addressId, userId, rules.linkColumns(user_address), tx);
    if (user_address?.default_shipping === true) {
      await userAddresses.setDefault(userId, addressId, tx);
    }

    const link = rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, tx));
    return rules.entry(row, link, false);
  });
}

// THE CARRIER'S ANSWER ABOUT AN ADDRESS, written back onto it. Not a caller's
// patch: `is_valid` and `is_residential` are outside the body's AddressPatch
// for exactly this reason.
export async function recordValidation(
  addressId: string, { is_valid, is_residential }: { is_valid: boolean; is_residential: boolean }
): Promise<Address> {
  return await withTransaction(async (tx) =>
    rules.assertAddress(addressId, await addresses.update(addressId, { is_valid, is_residential }, tx))
  );
}

export async function remove(addressId: string, userId: string): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const link = rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, tx));
    rules.assertNotOnAnActiveOrder(await addresses.isActive(addressId, userId, tx), "deleted");
    const row = rules.assertAddress(addressId, await addresses.getOne(addressId, tx));

    // THE LINK GOES FIRST. The address itself only goes when nothing at all
    // points at it - an order snapshot may still reference it, and a delivered
    // order must not lose where it went.
    await userAddresses.remove(addressId, userId, tx);
    if (!(await addresses.isReferenced(addressId, tx))) await addresses.remove(addressId, tx);
    return rules.entry(row, link, false);
  });
}

export async function setDefault(
  addressId: string, userId: string
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, tx));
    await userAddresses.setDefault(userId, addressId, tx);
    const link = rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, tx));
    const row = rules.assertAddress(addressId, await addresses.getOne(addressId, tx));
    return rules.entry(row, link, await addresses.isActive(addressId, userId, tx));
  });
}
