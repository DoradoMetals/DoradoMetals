import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as shipmentPatch from "#domain/shipping/shipments/patch.service.ts";
import * as orderRead from "#domain/shipping/shipments/order-read.ts";
import * as carrierPickups from "#db/shipping/pickups/repo.ts";

export const patchShipment = asyncHandler(async (req, res) => {
  const result = await shipmentPatch.patchShipment(param(req, "id"), req.body ?? {});
  return res.status(200).json(result);
});

// GET /api/orders/:orderId/shipments - the order's parcels, VERBATIM rows,
// both directions in one array (see order-read.ts). Mounted from the orders
// routes because the order id is the key the caller holds; the handler lives
// here because shipping owns the table. An order with no parcels answers []
// rather than 404 - "nothing has shipped yet" is an answer about a real
// order.
export const getShipmentsByOrder = asyncHandler(async (req, res) => {
  return res.json(await orderRead.getForOrder(param(req, "orderId")));
});

// GET /api/shipments/:id/pickups - the CARRIER pickups booked against one
// parcel, VERBATIM shipping.pickups rows.
//
// THE PARENT IS THE SHIPMENT, NOT THE ORDER, and that is what the column
// says: shipping.pickups.shipment_id. The composed wire hung a single
// `carrier_pickup` off the order, which meant an order-keyed read of a
// grandchild and one pickup where the table allows several. Do not confuse it
// with /orders/:orderId/pickups, which is fulfillments.pickups - US
// collecting from a customer, a different table for a different act.
export const getPickupsByShipment = asyncHandler(async (req, res) => {
  return res.json(await carrierPickups.getByShipments([param(req, "id")]));
});
