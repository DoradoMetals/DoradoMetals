import withTransaction from "#shared/db/withTransaction.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as rules from "#identity/places/addresses/rules.ts";
import { withDecisions } from "#shared/views.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  Address, AddressBookEntry, AddressPatch, UserAddressPatch,
} from "@dorado/contracts";

async function book(
  userId: string, addressId: string | null, executor?: Executor
): Promise<AddressBookEntry[]> {
  const rows = await userAddresses.view(userId, addressId, executor);
  return rows.map((row) => withDecisions(row, { actions: rules.actionsFor(row) }));
}

async function entry(
  addressId: string, userId: string, executor?: Executor
): Promise<AddressBookEntry> {
  const [found] = await book(userId, addressId, executor);
  return rules.assertEntry(addressId, found);
}

export async function list(
  userId: string, executor?: Executor
): Promise<AddressBookEntry[]> {
  return await book(userId, null, executor);
}

export async function getOne(
  addressId: string, userId: string, executor?: Executor
): Promise<AddressBookEntry> {
  return await entry(addressId, userId, executor);
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

export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  return await addresses.snapshot(address_id, executor);
}

export async function create(
  userId: string, address: AddressPatch | undefined, user_address: UserAddressPatch | undefined
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const size = (await userAddresses.listFor(userId, tx)).length;
    const row = await addresses.create(address ?? {}, tx);
    await userAddresses.create(row.id, userId, rules.linkColumns(user_address), tx);

    if (rules.defaultOnCreate(size, user_address?.default_shipping)) {
      await userAddresses.setDefault(userId, row.id, tx);
    }
    return await entry(row.id, userId, tx);
  });
}

export async function update(
  addressId: string, userId: string,
  address: AddressPatch | undefined, user_address: UserAddressPatch | undefined
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const current = await entry(addressId, userId, tx);
    rules.assertNotOnAnActiveOrder(current.locked, "edited");

    if (address) {
      rules.assertAddress(
        addressId, await addresses.update(addressId, rules.editedColumns(address), tx)
      );
    }
    await userAddresses.update(addressId, userId, rules.linkColumns(user_address), tx);
    if (user_address?.default_shipping === true) {
      await userAddresses.setDefault(userId, addressId, tx);
    }
    return await entry(addressId, userId, tx);
  });
}

export async function remove(addressId: string, userId: string): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    const current = await entry(addressId, userId, tx);
    rules.assertNotOnAnActiveOrder(current.locked, "deleted");

    await userAddresses.remove(addressId, userId, tx);
    if (!(await addresses.isReferenced(addressId, tx))) await addresses.remove(addressId, tx);
    return current;
  });
}

export async function setDefault(
  addressId: string, userId: string
): Promise<AddressBookEntry> {
  return await withTransaction(async (tx) => {
    await entry(addressId, userId, tx);
    await userAddresses.setDefault(userId, addressId, tx);
    return await entry(addressId, userId, tx);
  });
}
