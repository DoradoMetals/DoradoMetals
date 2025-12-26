import * as addressRepo from "#features/addresses/repo.js"
import { validateAddress } from "#features/fedex/controller.js"

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export async function list(userId) {
  return addressRepo.list(userId);
}

async function validateOrThrow(address) {
  const result = await validateAddress(address);

  if (!result || result.is_valid !== true) {
    throw badRequest(
      "We couldn't verify this address. Please check it, or use a different address."
    );
  }

  return result;
}

export async function create({ address, userId }) {
  const { is_valid, is_residential } = await validateOrThrow(address);

  const saved = await addressRepo.create({ address, userId });

  return addressRepo.updateValidation({
    addressId: saved.id,
    is_valid,
    is_residential,
  });
}

export async function update({ address, userId }) {
  const active = await addressRepo.isActive({ addressId: address.id, userId });
  if (active) {
    throw badRequest(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const { is_valid, is_residential } = await validateOrThrow(address);

  const saved = await addressRepo.update({ address, userId });
  if (!saved) throw badRequest("Address not found.");

  return addressRepo.updateValidation({
    addressId: saved.id,
    is_valid,
    is_residential,
  });
}

export async function remove({ addressId, userId }) {
  const active = await addressRepo.isActive({ addressId, userId });

  if (active) {
    throw badRequest(
      "Address cannot be deleted because it is associated with an active order."
    );
  }

  await addressRepo.remove({ addressId, userId });
  return "Deleted address.";
}

export async function setDefault({ userId, addressId }) {
  await addressRepo.setDefault({ userId, addressId });
  return "Set default address.";
}
