import { LeadSummaryWindow } from '@dorado/contracts'
import { parseStrict } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/funnel/service.ts'

export const get = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.get())
})

export const summary = asyncHandler(async (req, res) => {
  const window = parseStrict(LeadSummaryWindow, req.query, 'leads summary window')
  return res.status(200).json(await service.summary(window))
})

export const assignees = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.assignees())
})
