import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as mintService from '#catalog/mints/service.ts'

export const listMints = asyncHandler(async (_req, res) => {
  res.status(200).json(await mintService.listMints())
})
