import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as shipmentPatch from "#domain/shipping/shipments/patch.service.ts";
import * as labels from "#domain/shipping/labels.ts";
import * as shipmentView from "#domain/shipping/shipments/view.ts";
import { ShipmentPatch } from "@dorado/contracts";
import type { Request } from "express";

const isAdmin = (req: Request): boolean => req.user?.role === "admin";

// PATCH /api/shipments/:id - strict parsing once, here; the service receives a
// typed ShipmentPatch and checks RULES only. It answers the whole ShipmentView,
// so a caller writes the response into its cache rather than invalidating and
// refetching what it just changed.
export const patchShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const body = parseStrict(ShipmentPatch, req.body, "shipments/:id patch body");
  await shipmentPatch.patchShipment(id, body);
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)));
});

// GET /api/shipments/:id - ONE PARCEL, WHOLE: the row, the service and box it
// names by id, its carrier booking, its progress timeline and what may be done
// to it. Owner-or-admin through requireOwnShipment.
export const getShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const view = await shipmentView.getById(id, isAdmin(req));
  if (!view) {
    return res.status(404).json({ error: "Not Found", message: `no shipment ${id}` });
  }
  return res.json(view);
});

// GET /api/orders/:orderId/shipments - the order's parcels, both directions in
// one array; the caller filters on the row's own `direction`. Mounted from the
// orders routes (the order id is the key the caller holds); the handler lives
// here because shipping owns the table.
// An order with no parcels answers [] rather than 404 - "nothing has shipped
// yet" is an answer about a real order.
export const getShipmentsByOrder = asyncHandler(async (req, res) => {
  return res.json(await shipmentView.forOrder(uuidParam(req, "orderId"), isAdmin(req)));
});

// POST /api/shipments/:id/label - BUY (OR RETRY BUYING) THIS PARCEL'S LABEL.
//
// It was POST /api/orders/:id/label until ruling 67: a label belongs to the
// PARCEL, and the order it is for is resolved from the shipment rather than
// the other way round. NO BODY (ruling 58) - the weight, the declared value,
// the box, the service and the courier slot are all read from the shipment and
// its order. Answers the parcel's own view, refreshed.
export const buyShipmentLabel = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  await labels.buyLabel(id);
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)));
});
