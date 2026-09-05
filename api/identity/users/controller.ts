import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as usersService from "#identity/users/service.ts";

export const getOne = asyncHandler(async (req, res) =>
  res.status(200).json(await usersService.getUser(param(req, "id")))
);

export const list = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAllUsers())
);

export const listAdmins = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAdminUsers())
);
