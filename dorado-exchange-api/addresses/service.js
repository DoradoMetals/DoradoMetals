import * as repo from "./repo.js";
import { validateAddress } from "../controllers/shipping/fedexController.js";

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export async function list(userId) {
  return repo.list(userId);
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

  const saved = await repo.create({ address, userId });

  return repo.updateValidation({
    addressId: saved.id,
    is_valid,
    is_residential,
  });
}

export async function update({ address, userId }) {
  const active = await repo.isActive({ addressId: address.id, userId });
  if (active) {
    throw badRequest(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const { is_valid, is_residential } = await validateOrThrow(address);

  const saved = await repo.update({ address, userId });
  if (!saved) throw badRequest("Address not found.");

  return repo.updateValidation({
    addressId: saved.id,
    is_valid,
    is_residential,
  });
}

export async function remove({ addressId, userId }) {
  const active = await repo.isActive({ addressId, userId });

  if (active) {
    throw badRequest(
      "Address cannot be deleted because it is associated with an active order."
    );
  }

  await repo.remove({ addressId, userId });
  return "Deleted address.";
}

export async function setDefault({ userId, addressId }) {
  await repo.setDefault({ userId, addressId });
  return "Set default address.";
}
