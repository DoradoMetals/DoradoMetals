import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as orderPatch from "#features/orders/patch.service.ts";
import * as purchaseOrderService from "#features/purchase-orders/service.ts";
import * as salesOrderService from "#features/sales-orders/service.ts";

// GET /api/orders - the unified list read (Jacob, 28 August: the legacy read
// vocabulary goes the way of the legacy schema). Folds the four legacy list
// routes into one, PRESERVING each caller's exact row scope:
//
//   owner                        their own orders (the session's id, never the
//                                query's - the subjectOf precedent: a customer
//                                naming another user gets their own)
//   admin                        every order
//   admin + ?user_id=            that user's orders
//   ?direction=purchase|sale     one direction; absent, both, newest first
//
// The IMPLEMENTATIONS behind it are the existing per-direction read services,
// serving whatever the current repo switches serve - the repo-level read
// pivot is the next series' work, deliberately not this change's.
export const listOrders = asyncHandler(async (req, res) => {
  const callerIdValue = callerId(req);
  const isAdmin = req.user?.role === "admin";

  const direction =
    typeof req.query.direction === "string" ? req.query.direction : null;
  if (direction !== null && direction !== "purchase" && direction !== "sale") {
    const err: Error & { statusCode?: number } = new Error(
      `"direction" is "purchase" or "sale"`
    );
    err.statusCode = 400;
    throw err;
  }

  const namedUser =
    isAdmin && typeof req.query.user_id === "string" ? req.query.user_id : null;
  const scope = isAdmin && !namedUser ? "all" : (namedUser ?? callerIdValue);

  const purchases =
    direction === "sale"
      ? []
      : scope === "all"
        ? await purchaseOrderService.getAll()
        : await purchaseOrderService.listOrdersForUser(scope);
  const sales =
    direction === "purchase"
      ? []
      : scope === "all"
        ? await salesOrderService.getAll()
        : await salesOrderService.listOrdersForUser(scope);

  // Each list arrives newest-first from its own read; the merge keeps that.
  const stamp = (o: { created_at?: unknown }) =>
    new Date((o.created_at as string | Date | undefined) ?? 0).getTime();
  const merged = [...purchases, ...sales].sort((a, b) => stamp(b) - stamp(a));

  return res.json(merged);
});

export const patchOrder = asyncHandler(async (req, res) => {
  // The one-place acknowledgement that req.user is optional on the type; on
  // this guarded route it never fires.
  callerId(req);
  const updated = await orderPatch.patchOrder(req.params.id, req.body ?? {}, req.user!);
  return res.status(200).json(updated);
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  const spots = await orderPatch.putOrderSpots(req.params.id, req.body ?? {});
  return res.status(200).json(spots);
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const updated = await orderPatch.createOrderItem(req.params.id, req.body ?? {});
  return res.status(200).json({ updated });
});
