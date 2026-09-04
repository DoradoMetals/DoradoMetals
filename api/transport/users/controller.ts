import { UpdateCreditBody } from "@dorado/contracts";
import { param } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as usersService from "#domain/users/service.ts";

export const getOne = asyncHandler(async (req, res) =>
  res.status(200).json(await usersService.getUser(param(req, "id")))
);

export const list = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAllUsers())
);

export const listAdmins = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAdminUsers())
);

// THE SUBJECT IS THE PATH'S. `req.body` used to be forwarded whole, so a caller
// could send anything and a misspelt field was accepted in silence; the body
// now carries the operation and nothing else, strictly parsed, and the answer
// is the user row the adjustment produced - id and balance - rather than a
// count.
export const updateCredit = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateCreditBody, req.body, "users/credit body");
  const row = await usersService.adjustDoradoCredit(param(req, "id"), body);
  return res.status(200).json(row);
});
