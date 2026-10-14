import { param } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, strictBody, uuidParam } from '#shared/http/validate.ts'
import { UserNamesQuery, UserPatch } from '@dorado/contracts'
import * as usersService from '#accounts/users/service.ts'

export const getOne = asyncHandler(async (req, res) =>
  res.status(200).json(await usersService.getUser(param(req, 'id')))
)

export const list = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAllUsers())
)

export const listAdmins = asyncHandler(async (_req, res) =>
  res.status(200).json(await usersService.getAdminUsers())
)

export const patchUser = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(UserPatch, req.body)
  return res.status(200).json(await usersService.patch(id, body))
})

export const names = asyncHandler(async (req, res) => {
  const { ids } = parseStrict(UserNamesQuery, req.query, 'query')
  return res.status(200).json(await usersService.names(ids))
})
