import { AddressWriteBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import type { Request } from "express";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as lookupService from "#domain/places/lookup/service.ts";

// WHOSE ADDRESS BOOK. Every one of these took `user_id` from the request behind
// requireUser with nothing checking whose it was - a customer naming somebody
// else's id could read, edit, delete or re-default their book. An ADMIN may
// legitimately name another user (the customer drawer does), so the rule is
// "your own, unless you are an admin", and the id is a QUERY parameter on every
// verb: it says who the request is ABOUT, never what is being written.
const subjectOf = (req: Request): string => {
  const named = oneString(req.query.user_id);
  if (req.user?.role === "admin" && named) return named;
  return callerId(req);
};

const addressId = (req: Request): string => requiredParam(req.params.id, "id");

export const list = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.list(subjectOf(req)))
);

export const getOne = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.getOne(addressId(req), subjectOf(req)))
);

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressWriteBody, req.body, "addresses/create body");
  const entry = await addressService.create({
    address: body.address, user_address: body.user_address, userId: subjectOf(req),
  });
  return res.status(201).json(entry);
});

export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressWriteBody, req.body, "addresses/update body");
  const entry = await addressService.update(addressId(req), {
    address: body.address, user_address: body.user_address, userId: subjectOf(req),
  });
  return res.status(200).json(entry);
});

// THE ENTRY IT REMOVED, not a sentence. A message string was the answer for
// years and no caller ever showed it; the row is what a list has to drop.
export const remove = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.remove(addressId(req), subjectOf(req)))
);

export const setDefault = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.setDefault(addressId(req), subjectOf(req)))
);

// THE PLACES PROVIDER, ASKED SERVER-SIDE. `session_token` is passed through so
// a burst of keystrokes and the lookup that follows are one billed session.
export const suggest = asyncHandler(async (req, res) =>
  res.status(200).json(
    await lookupService.suggest(
      requiredParam(oneString(req.query.q), "q"), oneString(req.query.session_token) ?? null
    )
  )
);

export const lookup = asyncHandler(async (req, res) =>
  res.status(200).json(await lookupService.lookup(requiredParam(req.params.place_id, "place_id")))
);
