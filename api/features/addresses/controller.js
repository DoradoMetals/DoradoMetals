import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as addressService from "#features/addresses/service.js"

// WHOSE ADDRESS BOOK. Every one of these took user_id out of the request -
// req.query.user_id on the read, req.body.user_id on the writes - behind
// requireUser, and nothing asked whether it was the caller's. So a signed-in
// customer naming somebody else's id could read their address book, and create,
// edit, delete or re-default an address in it. Addresses are names, street
// addresses and phone numbers.
//
// Same shape as the order routes and the cart: an id taken from the request
// with nothing asking whose it is.
//
// An ADMIN may legitimately name another user - frontend/features/addresses/
// queries.ts has useUserAddress(userId) with requireAdmin, for the customer
// drawer - so the rule is "your own, unless you are an admin", exactly as
// shared/middleware/ownership.js treats an order.
const subjectOf = (req) => {
  const named = req.body?.user_id ?? req.query?.user_id;
  if (req.user?.role === "admin" && named) return named;
  return req.user.id;
};

export const getAll = asyncHandler(async (req, res) => {
  const rows = await addressService.list(subjectOf(req));
  return res.status(200).json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const { address } = req.body;
  const saved = await addressService.create({ address, userId: subjectOf(req) });
  return res.status(200).json(saved);
});

export const update = asyncHandler(async (req, res) => {
  const { address } = req.body;
  const saved = await addressService.update({ address, userId: subjectOf(req) });
  return res.status(200).json(saved);
});

export const remove = asyncHandler(async (req, res) => {
  const { address } = req.body;
  const msg = await addressService.remove({ userId: subjectOf(req), addressId: address.id });
  return res.status(200).json(msg);
});

export const setDefault = asyncHandler(async (req, res) => {
  const { address } = req.body;
  const msg = await addressService.setDefault({ userId: subjectOf(req), addressId: address.id });
  return res.status(200).json(msg);
});
