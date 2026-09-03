import { uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerOrdersService from "#domain/refiners/orders/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { RefinerOrderPatch } from "@dorado/contracts";

// Shape validation happens once, here: the service now receives an already-validated RefinerOrderPatch and checks RULES only.
const FIELDS = Object.keys(RefinerOrderPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a refiner order PATCH");
  if (unknown) return unknown;
  if (body.spots !== undefined) {
    if (!Array.isArray(body.spots) || body.spots.length === 0) {
      return { statusCode: 400, message: `"spots" must be a non-empty list of { name, bid }` };
    }
    for (const spot of body.spots as unknown[]) {
      const s = spot as { name?: unknown; bid?: unknown } | null;
      if (!s || typeof s.name !== "string" || typeof s.bid !== "number") {
        return { statusCode: 400, message: `"spots" entries are { name, bid }` };
      }
    }
  }
  return refusedValue(RefinerOrderPatch, body ?? {});
}

// PATCH /api/refiners/orders/:id - the id is a uuid and the body is a
// RefinerOrderPatch, checked before the service runs.
export const patchRefinerOrder = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const refusal = refusedField(body);
  if (refusal) refuseWith(refusal.statusCode, refusal.message);
  const engagement = await refinerOrdersService.patchRefinerOrder(id, body as never);
  return res.status(200).json(engagement);
});

// GET /api/orders/:orderId/refiners - the BARE engagement row for a customer
// order, mounted from the orders routes (reads resolve from the parent path).
// The row's own id is how PATCH /refiners/orders/:id gets its key; the order
// id is the key every component already holds.
export const getRefinerOrderByOrder = asyncHandler(async (req, res) => {
  const orderId = uuidParam(req, "orderId");
  const engagement = await refinerOrdersService.getByOrder(orderId);
  if (!engagement) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${orderId} has no refiner engagement`,
    });
  }
  return res.json(engagement);
});

// GET /api/orders/:orderId/refiners/spots and .../refiners/items have their handlers in refiners/spots/controller.ts and refiners/items/controller.ts (each owns its own table); the paths are unchanged, still declared by features/orders/routes.ts.
