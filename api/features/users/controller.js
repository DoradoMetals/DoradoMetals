import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as usersService from "#features/users/service.ts"

export const getUser = asyncHandler(async (req, res) => {
  const result = await usersService.getUser(req.query.user_id);
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
