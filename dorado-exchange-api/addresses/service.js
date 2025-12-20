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

async function validateAndSaveFlags(address) {
  const { is_valid, is_residential } = await validateAddress(address);
  return repo.updateValidation({
    addressId: address.id,
    is_valid,
    is_residential,
  });
}

export async function create({ address, userId }) {
  const saved = await repo.create({ address, userId });
  return validateAndSaveFlags(saved);
}

export async function update({ address, userId }) {
  
  const locked = await repo.isLocked({ addressId: address.id, userId });
  if (locked) {
    throw badRequest(
      "Address cannot be edited because it is associated with an active order."
    );
  }

  const saved = await repo.update({ address, userId });

  if (!saved) {
    throw badRequest("Address not found.");
  }

  return validateAndSaveFlags(saved);
}

export async function remove({ addressId, userId }) {
  const active = await repo.isActive({ addressId, userId });

  if (active.has_active_purchase_orders || active.has_active_sales_orders) {
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
