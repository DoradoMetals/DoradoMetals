import { AddressWriteBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import type { Request } from "express";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as addressService from "#identity/places/addresses/service.ts";
import * as lookupService from "#identity/places/lookup/service.ts";

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
  const entry = await addressService.create(
    subjectOf(req), body.address, body.user_address
  );
  return res.status(201).json(entry);
});

export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(AddressWriteBody, req.body, "addresses/update body");
  const entry = await addressService.update(
    addressId(req), subjectOf(req), body.address, body.user_address
  );
  return res.status(200).json(entry);
});

export const remove = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.remove(addressId(req), subjectOf(req)))
);

export const setDefault = asyncHandler(async (req, res) =>
  res.status(200).json(await addressService.setDefault(addressId(req), subjectOf(req)))
);

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
