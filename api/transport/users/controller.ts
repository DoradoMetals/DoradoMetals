import { UpdateCreditBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as usersService from "#domain/users/service.ts"

export const getUser = asyncHandler(async (req, res) => {
  const result = await usersService.getUser(requiredParam(req.query.user_id, "user_id"));
  return res.status(200).json(result);
});

export const getAll = asyncHandler(async (req, res) => {
  const result = await usersService.getAllUsers();
  return res.status(200).json(result);
});

export const getAdmins = asyncHandler(async (req, res) => {
  const result = await usersService.getAdminUsers();
  return res.status(200).json(result);
});

// THE THREE FIELDS, NAMED AND STRICTLY PARSED. `req.body` used to be
// forwarded whole, so a caller could send anything and a misspelt field was
// accepted in silence; the service then had to accept `mode` as well as `op`
// because the browser still spoke the old spelling. Neither is true any more
// (shapes are not being preserved on this branch): an unknown key or a wrong
// type is a 400 before the service runs, and the answer is the user row the
// adjustment produced - id and balance - rather than a count.
export const updateCredit = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateCreditBody, req.body, "users/update_credit body");
  const row = await usersService.adjustDoradoCredit(body);
  return res.status(200).json(row);
});
