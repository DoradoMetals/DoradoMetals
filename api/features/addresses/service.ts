// Addresses, with the two rules the repo does not enforce: an address in use by
// an unfinished order can be neither edited nor deleted underneath it.
import * as addressRepo from "#features/addresses/repo.js";
import type { AddressRow } from "#features/addresses/repo.next.ts";

// The controller's error handler reads statusCode off the thrown error, so it
// is declared here rather than assigned onto a bare Error.
interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

export async function list(userId: string): Promise<AddressRow[]> {
  return addressRepo.list(userId);
}

export async function create({
  address,
  userId,
}: {
  address: Partial<AddressRow>;
  userId: string;
}): Promise<AddressRow> {
  return addressRepo.create({ address, userId });
}

export async function update({
  address,
  userId,
}: {
  address: Partial<AddressRow> & { id: string };
  userId: string;
}): Promise<AddressRow> {
  const active = await addressRepo.isActive({ addressId: address.id, userId });
  if (active) {
    throw badRequest(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const saved = await addressRepo.update({ address, userId });
  if (!saved) throw badRequest("Address not found.");

  return saved;
}

// Both of these return a MESSAGE STRING, not the row and not a boolean. That is
// what the controller sends back, so it is what the type says.
export async function remove({
  addressId,
  userId,
}: {
  addressId: string;
  userId: string;
}): Promise<string> {
  const active = await addressRepo.isActive({ addressId, userId });

  if (active) {
    throw badRequest(
      "Address cannot be deleted because it is associated with an active order."
    );
  }

  await addressRepo.remove({ addressId, userId });
  return "Deleted address.";
}

export async function setDefault({
  userId,
  addressId,
}: {
  userId: string;
  addressId: string;
}): Promise<string> {
  await addressRepo.setDefault({ userId, addressId });
  return "Set default address.";
}
