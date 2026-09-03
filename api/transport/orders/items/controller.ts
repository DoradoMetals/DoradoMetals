// The order's LINES. Bodies parse strictly against the contract; a malformed
// path id is a 400 naming it rather than a query that matches nothing.
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import * as editLine from "#domain/orders/edit-line.ts";
import { OrderItemCreate } from "@dorado/contracts";

export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await editLine.linesFor(uuidParam(req, "id")));
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const body = strictBody(OrderItemCreate, req.body);
  if (!body.item) refuseWith(400, `"item" is required`);
  const updated = await editLine.createLine(uuidParam(req, "id"), body.item!);
  return res.status(200).json({ updated });
});

// The PATCH's strict parse is the service's refusedField, which names the field.
// The ORIGINAL body goes down: absent, null and a value are three instructions.
export const patchOrderItem = asyncHandler(async (req, res) => {
  const result = await editLine.editLine(uuidParam(req, "id"), req.body ?? {});
  return res.status(200).json(result);
});

export const deleteOrderItem = asyncHandler(async (req, res) => {
  return res.status(200).json(await editLine.removeLine(uuidParam(req, "id")));
});
