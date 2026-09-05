import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orders from "#orders/service.ts";
import { OrderItemPatch } from "@dorado/contracts";

export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await orders.linesFor(uuidParam(req, "id")));
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const input = strictBody(OrderItemPatch, req.body);
  return res.status(200).json(await orders.createLine(uuidParam(req, "id"), input));
});

export const patchOrderItem = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderItemPatch, req.body);
  return res.status(200).json(await orders.editLine(uuidParam(req, "id"), changes));
});

export const deleteOrderItem = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.removeLine(uuidParam(req, "id")));
});
