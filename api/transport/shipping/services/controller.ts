import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as servicesService from "#domain/shipping/services/service.ts";
import { oneString } from "#shared/http/query.ts";

export const getAll = asyncHandler(async (req, res) => {
  const result = await servicesService.getAllServices();
  return res.status(200).json(result);
});

// GET /api/carrier_services/sale_options - PUBLIC, deliberately: the product page shows the sale delivery prices to signed-out visitors. Reference rows the client maps by `code`; icons stay a client-side map beside the selector.
export const getSaleOptions = asyncHandler(async (_req, res) => {
  const result = await servicesService.getSaleOptions();
  return res.status(200).json(result);
});

// GET /api/carrier_services/offered[?carrier_id=]
//
// The two services checkout offers, in the order they render, with the codes a
// rate quote and a pickup-availability check are keyed by. The frontend joins
// rates to these by `code` and renders `name`; it never spells either.
export const getOffered = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id);
  const result = await servicesService.getOfferedServices(carrier_id);
  return res.status(200).json(result);
});

// Answers 200 with null when no id is given, rather than 400 - what this
// endpoint has always done. The id went into `WHERE id = $1` as undefined,
// which node-postgres sends as null, which matches no row.
export const getOne = asyncHandler(async (req, res) => {
  const id = oneString(req.query.id);
  const result = id ? await servicesService.getServiceById(id) : null;
  return res.status(200).json(result);
});

// Same again, except the list form answers with an empty array.
export const getByCarrier = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id);
  const result = carrier_id ? await servicesService.getServicesByCarrierId(carrier_id) : [];
  return res.status(200).json(result);
});

export const create = asyncHandler(async (req, res) => {
  const { service } = req.body;
  const result = await servicesService.createService(service);
  return res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { service } = req.body;
  const result = await servicesService.updateService(service);
  return res.status(200).json(result);
});

// The frontend sends { id }, and the service takes an id. Passing the whole body
// made every delete die on `invalid input syntax for type uuid`, so this
// endpoint has never once succeeded.
export const remove = asyncHandler(async (req, res) => {
  await servicesService.removeService(req.body.id);
  return res.status(200).json(true);
});
