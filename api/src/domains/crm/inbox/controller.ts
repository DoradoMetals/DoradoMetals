import { requiredParam } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/inbox/service.ts'

export const list = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list())
})

export const markRead = asyncHandler(async (req, res) => {
  const key = requiredParam(req.params.key, 'key')
  await service.markRead(key)
  return res.status(200).json({ message: 'marked read' })
})
