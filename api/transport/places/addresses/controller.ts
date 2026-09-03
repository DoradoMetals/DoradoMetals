import { callerId, requiredParam } from "#shared/http/caller.ts";
import type { Request } from "express";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as addressService from "#domain/places/addresses/service.ts"

// WHOSE ADDRESS BOOK. Every one of these took user_id out of the request -
// oneString(req.query.user_id) on the read, req.body.user_id on the writes - behind
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
const subjectOf = (req: Request): string => {
  const named = req.body?.user_id ?? req.query?.user_id;
  if (req.user?.role === "admin" && named) return named;
  return callerId(req);
};

// THE WIRE KEEPS THE TWO THINGS APART (2026-08-27). Internally the service
// still composes an address with its link where that is convenient; at this
// edge the composition is taken back apart, because a user_address inside an
// address entity is exactly the smearing the new schema exists to end.
const split = (c: { user_address: { user_id: string | null; label: string | null; default_shipping: boolean | null } } & { id: string }) => {
  const { user_address, ...address } = c;
  return { address, user_address: { address_id: address.id, ...user_address } };
};

export const getAll = asyncHandler(async (req, res) => {
  const rows = await addressService.list(subjectOf(req));
  return res.status(200).json(rows.map((r) => split(r).address));
});

// The other half of the book: the caller's relationships, joined client-side
// by address_id.
export const getUserAddresses = asyncHandler(async (req, res) => {
  const rows = await addressService.list(subjectOf(req));
  return res.status(200).json(rows.map((r) => split(r).user_address));
});

export const create = asyncHandler(async (req, res) => {
  const { address, user_address } = req.body;
  const saved = await addressService.create({ address, user_address, userId: subjectOf(req) });
  return res.status(200).json(split(saved));
});

export const update = asyncHandler(async (req, res) => {
  const { address, user_address } = req.body;
  const saved = await addressService.update({ address, user_address, userId: subjectOf(req) });
  return res.status(200).json(split(saved));
});

export const remove = asyncHandler(async (req, res) => {
  const { address, address_id } = req.body;
  const msg = await addressService.remove({ userId: subjectOf(req), addressId: address_id ?? address?.id });
  return res.status(200).json(msg);
});

export const setDefault = asyncHandler(async (req, res) => {
  const { address, address_id } = req.body;
  const msg = await addressService.setDefault({ userId: subjectOf(req), addressId: address_id ?? address?.id });
  return res.status(200).json(msg);
});
