import { z } from 'zod/v4'
import { parseStrict, uuidLike, uuidParam } from '#shared/http/validate.ts'
import { manyStrings } from '#shared/http/query.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#pricing/lead-estimates/service.ts'

const LeadIds = z.array(uuidLike).min(1)

export const getTotals = asyncHandler(async (req, res) => {
  const asked = (manyStrings(req.query.lead_ids) ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  const lead_ids = parseStrict(LeadIds, asked, 'pricing/lead-estimates lead_ids')
  return res.status(200).json(await service.totals(lead_ids))
})

export const getOne = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'leadId')
  return res.status(200).json(await service.forLead(lead_id))
})
