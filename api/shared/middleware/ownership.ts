// Guards against a signed-in customer acting on ANY order whose id they hold — routes read the order id from the request body, not from session ownership. Demonstrated for real: get_purchase_order_metals leaked another customer's spots; cancel_order could ship their metal back.
// In middleware, not each service, so a new caller can't silently skip the check; UUIDs make guessing hard, not impossible.
import type { NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";

// A new id spelling must be added here AND in orderIdFrom below — the guard refusing on none found is only safe if this list is deliberate.
type OrderBody = {
  order?: { id?: string | null } | null;
  order_id?: string | null;
};

// A body using none of these spellings is refused, not waved through — a guard that can't find its subject must not assume it's fine.
function orderIdFrom(body: OrderBody = {}): string | null {
  return body.order?.id ?? body.order_id ?? null;
}

// Also called directly by features/media/pdfs/serve.ts before serving a stored document — one copy of the ownership query, not two that could drift.
// Depends on the orders backfill having run in production — this schema is native-only, no exchange fallback (see CLAUDE.md's production sequencing).
export async function orderOwnedBy(
  orderId: string,
  userId: string,
  executor?: PoolClient
): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM orders.orders WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [orderId, userId],
    executor
  );
  return rows.length > 0;
}

export function requireOwnOrder(req: Request, res: Response, next: NextFunction) {
  // Admins administer every order. requireUser has already run, so req.user is
  // present; a missing one means this was mounted without a guard in front of
  // it, which is a wiring mistake rather than an anonymous caller.
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role === "admin") return next();

  const orderId = orderIdFrom(req.body);
  if (!orderId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "no order was named",
    });
  }

  // A missing row is a refusal: "the order does not exist" and "the order is
  // not yours" are the same answer to somebody who should not know the
  // difference.
  orderOwnedBy(orderId, req.user.id)
    .then((owned) => {
      if (!owned) {
        return res.status(403).json({
          error: "Forbidden",
          message: "That order is not yours",
        });
      }
      next();
    })
    .catch(next);
}

// Same question for routes carrying the order id in the PATH rather than the body (e.g. /:id/items, /:orderId/shipments).
// Checks BOTH :id and :orderId — reading only one would silently wave through every route using the other (admins short-circuit above it, so nobody would notice).
export function requireOwnOrderParam(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role === "admin") return next();

  // express 5 types a param as string | string[] (repeatable params); these
  // routes declare :id / :orderId once, so an array here is a malformed URL.
  const raw = req.params.id ?? req.params.orderId;
  const orderId = Array.isArray(raw) ? raw[0] : raw;
  if (!orderId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "no order was named",
    });
  }

  orderOwnedBy(orderId, req.user.id)
    .then((owned) => {
      if (!owned) {
        return res.status(403).json({
          error: "Forbidden",
          message: "That order is not yours",
        });
      }
      next();
    })
    .catch(next);
}

// requireOwnOrder can't cover this — POST /api/shipping/get_tracking names a shipment_id, not an order id.
// get_tracking is a WRITE, not a read: it deletes and reinserts tracking events (the same removeEvents that once emptied seven production shipments' histories) — without this, a customer holding someone else's shipment id could overwrite their tracking and burn a FedEx call. Not requireAdmin, since the calling drawer is customer-facing too.
// Resolves ownership through fulfillments.shipments → fulfillments.fulfillments → orders.orders.
export function requireOwnShipment(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role === "admin") return next();

  const shipmentId = req.body?.shipment_id ?? req.query?.shipment_id ?? null;
  if (!shipmentId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "no shipment was named",
    });
  }

  // A missing row is a refusal here too — existence and ownership must answer identically to an unauthorized caller.
  query(
    `SELECT 1
       FROM fulfillments.shipments fs
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       JOIN orders.orders o ON o.id = f.order_id
      WHERE fs.shipment_id = $1 AND o.user_id = $2
      LIMIT 1`,
    [shipmentId, req.user.id]
  )
    .then(({ rows }) => {
      if (!rows.length) {
        return res.status(403).json({
          error: "Forbidden",
          message: "That shipment is not yours",
        });
      }
      next();
    })
    .catch(next);
}
