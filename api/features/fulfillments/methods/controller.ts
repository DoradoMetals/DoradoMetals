import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as methodService from "#features/fulfillments/methods/service.ts";

// The menu a customer is offered, per direction. Guarded rather than public:
// which methods exist and which are hidden is operational information, and a
// signed-out visitor has no order to fulfil.
export const getMethods = asyncHandler(async (req, res) => {
  return res.status(200).json(await methodService.listAvailable(req.query.direction));
});

export const getAllMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listAll());
});

export const updateMethod = asyncHandler(async (req, res) => {
  const { method } = req.body;
  const saved = await methodService.update({
    ...method,
    updated_by_id: req.user?.id ?? null,
  });
  return res.status(200).json(saved);
});
