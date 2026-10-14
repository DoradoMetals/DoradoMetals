import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { requiredParam } from '#shared/http/caller.ts'
import * as service from '#documents/outbox/service.ts'

export const list = asyncHandler(async (_req, res) => {
  return res.status(200).json(service.list())
})

export const show = asyncHandler(async (req, res) => {
  const message_id = requiredParam(req.params.message_id, 'message_id')
  const message = service.show(message_id)
  return res.status(200).type('html').send(message.html)
})
