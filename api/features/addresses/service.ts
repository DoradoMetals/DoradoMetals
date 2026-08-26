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

// ONE ADDRESS BY ID, WHICH THIS SERVICE HAS NOT EXPOSED SINCE 26 DECEMBER 2025.
//
// features/payments/service.ts calls addressService.getAddressFromId to find
// the state a sales order is taxed in. The function did not exist: it was lost
// in be03eed3, the feature-slicing restructure, and nothing has defined it
// since. `import * as addressService` makes the missing name `undefined` rather
// than an import error, so it fails at the call.
//
// The effect is that POST /api/stripe/update_payment_intent throws on its first
// await and answers 500 - EVERY TIME. That is the route that prices the cart and
// tells Stripe what to charge, so the intent keeps the $10.00 placeholder
// createPaymentIntent opens it with.
//
// Verified on master, which is what auto-deploys: the call is at
// dorado-exchange-api/features/stripe/service.js:82 and nothing in that tree
// defines it either. Driven over HTTP here to be sure rather than reasoned
// about - see features/payments/update-intent.test.js.
//
// The repo's getFromId returns a LIST, because exchange's did and both
// implementations kept that shape. The caller wants one address, so it takes
// the first, and reads `address?.state ?? "TX"` - so an id that matches nothing
// falls back rather than throwing, which is the behaviour the call site was
// already written for.
export async function getAddressFromId(
  addressId: string
): Promise<AddressRow | undefined> {
  const rows = await addressRepo.getFromId(addressId);
  return rows[0];
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
