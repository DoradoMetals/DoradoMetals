import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";

// The menu a customer is offered, per direction. Guarded rather than public:
// which methods exist and which are hidden is operational information, and a
// signed-out visitor has no order to fulfil.
export const getMethods = asyncHandler(async (req, res) => {
  return res.status(200).json(await methodService.listAvailable(req.query.direction));
});

export const getAllMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listAll());
});

// NO CONTRACT SCHEMA EXISTS YET for a method patch - @dorado/contracts has no
// MethodPatch, so this stays a hand-checked shape rather than a strict parse
// (CRUD-batch-3 gap, listed rather than hand-written: see the batch report).
// What it DOES fix is the prop-spread the endpoint used to do
// (`{ ...method, updated_by_id }` straight into the service) - every field the
// service can write is named here instead.
export const updateMethod = asyncHandler(async (req, res) => {
  const method = (req.body?.method ?? {}) as Record<string, unknown>;
  if (typeof method.id !== "string" || !method.id) {
    refuseWith(400, "method.id is required");
  }
  const saved = await methodService.update(method.id as string, {
    label: method.label as string | undefined,
    admin_label: method.admin_label as string | undefined,
    enabled: method.enabled as boolean | undefined,
    hidden: method.hidden as boolean | undefined,
  });
  return res.status(200).json(saved);
});
