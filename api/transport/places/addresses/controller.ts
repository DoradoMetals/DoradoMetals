import { AddressCreateBody, AddressUpdateBody, AddressIdBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import type { Request } from "express";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as addressService from "#domain/places/addresses/service.ts"
import type { ComposedAddress } from "#domain/places/addresses/compose.ts";

// WHOSE ADDRESS BOOK: every one of these took user_id from the request behind requireUser with nothing checking whose it was - a customer naming somebody else's id could read, edit, delete or re-default their address book.
// An ADMIN may legitimately name another user (the customer drawer does) - so the rule is "your own, unless you are an admin".
const subjectOf = (req: Request): string => {
  const named = req.body?.user_id ?? req.query?.user_id;
  if (req.user?.role === "admin" && named) return named;
  return callerId(req);
};

// The wire keeps the two things apart: the service composes an address with its link internally, but a user_address inside an address entity is exactly the smearing the new schema exists to end.
const split = (c: ComposedAddress) => ({
  address: {
    id: c.id,
    line_1: c.line_1,
    line_2: c.line_2,
    city: c.city,
    state: c.state,
    country: c.country,
    zip: c.zip,
    country_code: c.country_code,
    phone_number: c.phone_number,
    created_at: c.created_at,
    updated_at: c.updated_at,
    is_valid: c.is_valid,
    is_residential: c.is_residential,
  },
  user_address: {
    address_id: c.id,
    user_id: c.user_address.user_id,
    label: c.user_address.label,
    default_shipping: c.user_address.default_shipping,
  },
});

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
  const body = parseStrict(AddressCreateBody, req.body, "places/addresses/create body");
  const saved = await addressService.create({
    address: body.address, user_address: body.user_address, userId: subjectOf(req),
  });
  return res.status(200).json(split(saved));
});

export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressUpdateBody, req.body, "places/addresses/update body");
  const saved = await addressService.update({
    address: body.address, user_address: body.user_address, userId: subjectOf(req),
  });
  return res.status(200).json(split(saved));
});

export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressIdBody, req.body, "places/addresses/delete body");
  const msg = await addressService.remove({ userId: subjectOf(req), addressId: body.address_id });
  return res.status(200).json(msg);
});

export const setDefault = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressIdBody, req.body, "places/addresses/set_default body");
  const msg = await addressService.setDefault({ userId: subjectOf(req), addressId: body.address_id });
  return res.status(200).json(msg);
});
