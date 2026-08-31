import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as usersService from "#features/users/service.ts"

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

export const updateCredit = asyncHandler(async (req, res) => {
  const result = await usersService.adjustDoradoCredit(req.body);
  return res.status(200).json(result);
});
