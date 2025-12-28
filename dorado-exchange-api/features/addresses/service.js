import * as addressRepo from "#features/addresses/repo.js";

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export async function list(userId) {
  return addressRepo.list(userId);
}

export async function create({ address, userId }) {
  return addressRepo.create({ address, userId });
}

export async function update({ address, userId }) {
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
