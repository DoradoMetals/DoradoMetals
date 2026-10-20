import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/lookups/service.ts'

export const sources = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.leadSources())
})

export const estimateKinds = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.leadEstimateKinds())
})

export const contactPreferences = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.leadContactPreferences())
})

export const weightUnits = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.leadWeightUnits())
})

export const purities = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.purities())
})

export const documentKinds = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.leadDocumentKinds())
})
