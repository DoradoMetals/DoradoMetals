import { uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerItemsService from "#domain/refiners/items/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { RefinerItemPatch } from "@dorado/contracts";

// SHAPE VALIDATION, ONCE, HERE (moved from domain/refiners/items/service.ts -
// Jacob's transport-boundary ruling): the service now receives an already-
// validated RefinerItemPatch and checks RULES only. `content` keeps its own
// bespoke refusal message - it is derived from post_melt and purity, and
// saying so is worth more than "not a field of a refiner item PATCH".
const FIELDS = Object.keys(RefinerItemPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a refiner item PATCH", (field) =>
    field === "content"
      ? `"content" is derived from post_melt and purity, not written`
      : null
  );
  if (unknown) return unknown;
  return refusedValue(RefinerItemPatch, body ?? {});
}

// PATCH /api/refiners/items/by-order-item/:orderItemId - the orderItemId is a
// uuid and the body is a RefinerItemPatch, checked before the service runs.
export const patchRefinerItem = asyncHandler(async (req, res) => {
  const orderItemId = uuidParam(req, "orderItemId");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const refusal = refusedField(body);
  if (refusal) refuseWith(refusal.statusCode, refusal.message);
  const result = await refinerItemsService.patchRefinerItem(orderItemId, body as never);
  return res.status(200).json(result);
});

// GET /api/orders/:orderId/refiners/items - the path is declared by
// features/orders/routes.ts (the order id is the key the caller holds); the
// handler lives here because this feature owns the table. Admin-only: what the
// refinery reported decides what the business is paid.
export const getRefinerItemsByOrder = asyncHandler(async (req, res) => {
  return res.json(await refinerItemsService.forOrder(uuidParam(req, "orderId")));
});
