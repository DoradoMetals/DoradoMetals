import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as rules from "#domain/places/addresses/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Address, AddressBookEntry, AddressWriteBody } from "@dorado/contracts";

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
    if (address) out.push(rules.entry(address, link, locked.has(address.id)));
  }
  return out.sort(rules.byDefaultThenRecipient);
}

export async function getOne(
  addressId: string, userId: string, executor?: Executor
): Promise<AddressBookEntry> {
  const link = rules.assertInBook(addressId, await userAddresses.getOne(addressId, userId, executor));
  const address = rules.assertAddress(addressId, await addresses.getOne(addressId, executor));
  return rules.entry(address, link, await addresses.isActive(addressId, userId, executor));
}

export async function getAddressFromId(
  address_id: string, executor?: Executor
): Promise<Address | undefined> {
  return await addresses.getOne(address_id, executor);
}

export async function isActive(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  return await addresses.isActive(address_id, user_id, executor);
}

export async function inBook(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const links = await userAddresses.getByAddress(address_id, executor);
  return links.some((l) => l.user_id === user_id);
}

export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  return await addresses.snapshot(address_id, executor);
}

export async function create(
  { address, user_address, userId }: AddressWriteBody & { userId: string }
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const size = (await userAddresses.listFor(userId, tx)).length;
    const id = randomUUID();
    const row = await addresses.create(id, address ?? {}, tx);
    const link = await userAddresses.create(
      randomUUID(), id, userId, rules.linkColumns(user_address), tx
    );

    if (!rules.defaultOnCreate(size, user_address?.default_shipping)) {
      return rules.entry(row, link, false);
    }
    await userAddresses.setDefault(userId, id, tx);
    return rules.entry(row, rules.assertInBook(id, await userAddresses.getOne(id, userId, tx)), false);
  });
}

export async function update(
  addressId: string, { address, user_address, userId }: AddressWriteBody & { userId: string }
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
