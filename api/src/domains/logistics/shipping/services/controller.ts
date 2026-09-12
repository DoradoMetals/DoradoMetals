import { z } from 'zod/v4'
import { CarrierServiceDeleteBody, CarrierServicePatch } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as servicesService from '#logistics/shipping/services/service.ts'
import { oneString } from '#shared/http/query.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'

const CreateBody = z.object({ service: CarrierServicePatch }).strict()

export const getAll = asyncHandler(async (req, res) => {
  const result = await servicesService.getAllServices()
  return res.status(200).json(result)
})

export const getSaleOptions = asyncHandler(async (_req, res) => {
  const result = await servicesService.getSaleOptions()
  return res.status(200).json(result)
})

export const getOffered = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id)
  const result = await servicesService.getOfferedServices(carrier_id)
  return res.status(200).json(result)
})

export const getOne = asyncHandler(async (req, res) => {
  const id = oneString(req.query.id)
  const result = id ? await servicesService.getServiceById(id) : null
  return res.status(200).json(result)
})

export const getByCarrier = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id)
  const result = carrier_id ? await servicesService.getServicesByCarrierId(carrier_id) : []
  return res.status(200).json(result)
})

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(CreateBody, req.body, 'carrier_services/create body')
  const result = await servicesService.createService(body.service)
  return res.status(201).json(result)
})

export const patchService = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const changes = parseStrict(
    CarrierServicePatch.omit({ id: true }),
    req.body,
    'carrier_services PATCH body'
  )
  const result = await servicesService.updateService({ ...changes, id })
  return res.status(200).json(result)
})

export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(CarrierServiceDeleteBody, req.body, 'carrier_services/delete body')
  await servicesService.removeService(body.id)
  return res.status(200).json(true)
})
