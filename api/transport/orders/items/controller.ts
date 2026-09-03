// The order's LINES. Every body parses strictly against the contract; a
// malformed path id is a 400 naming it rather than a query that matches
// nothing. A refusal below this line is a domain error the middleware maps.
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orders from "#domain/orders/service.ts";
import { OrderItemCreate, OrderItemPatch } from "@dorado/contracts";

export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await orders.linesFor(uuidParam(req, "id")));
});

// The body is a union: `{ bullion_id }` for a catalogue line, or a declared lot
// of scrap. Two pure rules turn either into a row.
export const createOrderItem = asyncHandler(async (req, res) => {
  const input = strictBody(OrderItemCreate, req.body);
  return res.status(200).json(await orders.createLine(uuidParam(req, "id"), input));
});

// ONE FLAT PATCH of the line's own columns. A key present is written, an
// explicit null clears, an absent key is left alone.
export const patchOrderItem = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderItemPatch, req.body);
  return res.status(200).json(await orders.editLine(uuidParam(req, "id"), changes));
});

export const deleteOrderItem = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.removeLine(uuidParam(req, "id")));
});
