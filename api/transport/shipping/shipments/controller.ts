import { uuidParam } from "#shared/http/validate.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as shipmentPatch from "#domain/shipping/shipments/patch.service.ts";
import * as orderRead from "#domain/shipping/shipments/order-read.ts";
import * as carrierPickups from "#db/shipping/pickups/repo.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { ShipmentPatch } from "@dorado/contracts";

// SHAPE VALIDATION, ONCE, HERE (moved from domain/shipping/shipments/
// patch.service.ts - Jacob's transport-boundary ruling): the service now
// receives an already-validated ShipmentPatch and checks RULES only.
const FIELDS = Object.keys(ShipmentPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a shipment PATCH");
  if (unknown) return unknown;
  // The tracking pair travels together: a number with no carrier (or the
  // reverse) is half a write the old route never made.
  if ((body.tracking_number === undefined) !== (body.carrier_id === undefined)) {
    return {
      statusCode: 400,
      message: `"tracking_number" and "carrier_id" travel together`,
    };
  }
  return refusedValue(ShipmentPatch, body ?? {});
}

// PATCH /api/shipments/:id - the id is a uuid and the body is a
// ShipmentPatch, checked before the service runs.
export const patchShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const refusal = refusedField(body);
  if (refusal) refuseWith(refusal.statusCode, refusal.message);
  const result = await shipmentPatch.patchShipment(id, body as never);
  return res.status(200).json(result);
});

// GET /api/orders/:orderId/shipments - the order's parcels, VERBATIM rows,
// both directions in one array (see order-read.ts). Mounted from the orders
// routes because the order id is the key the caller holds; the handler lives
// here because shipping owns the table. An order with no parcels answers []
// rather than 404 - "nothing has shipped yet" is an answer about a real
// order.
export const getShipmentsByOrder = asyncHandler(async (req, res) => {
  return res.json(await orderRead.getForOrder(uuidParam(req, "orderId")));
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
  return res.json(await carrierPickups.getByShipments([uuidParam(req, "id")]));
});
