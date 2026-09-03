import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as shipmentPatch from "#domain/shipping/shipments/patch.service.ts";
import * as orderRead from "#domain/shipping/shipments/order-read.ts";
import * as carrierPickups from "#db/shipping/pickups/repo.ts";
import { shipping } from "@dorado/contracts";

// PATCH /api/shipments/:id - strict parsing once, here; the service (D214
// item 11) receives a typed shipping.shipments.Patch and checks RULES only - the
// tracking-pair rule moved with it.
export const patchShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const body = parseStrict(shipping.shipments.Patch, req.body, "shipments/:id patch body");
  const result = await shipmentPatch.patchShipment(id, body);
  return res.status(200).json(result);
});

// GET /api/orders/:orderId/shipments - the order's parcels, VERBATIM rows, both directions in one array (see order-read.ts). Mounted from the orders routes (order id is the key the caller holds); the handler lives here (shipping owns the table).
// An order with no parcels answers [] rather than 404 - "nothing has shipped yet" is an answer about a real order.
export const getShipmentsByOrder = asyncHandler(async (req, res) => {
  return res.json(await orderRead.getForOrder(uuidParam(req, "orderId")));
});

// GET /api/shipments/:id/pickups - the CARRIER pickups booked against one parcel, VERBATIM shipping.pickups rows.
// The parent is the SHIPMENT (shipping.pickups.shipment_id), not the order - not to be confused with /orders/:orderId/pickups (fulfillments.pickups, us collecting from the customer).
export const getPickupsByShipment = asyncHandler(async (req, res) => {
  return res.json(await carrierPickups.getByShipments([uuidParam(req, "id")]));
});
