// PATCH /api/orders/:id - THE order mutation surface, one namespace, both
// directions.
//
// Jacob's rulings, 28 August, in arrival order: "We shouldn't need 20
// different queries for updating a purchase order" collapsed twenty-two POST
// routes into one document; "patching things like orders.items and
// orders.spots should require their own new endpoints" re-sliced that
// document per RESOURCE; and the namespace ruling finished it -
// /purchase_orders and /sales_orders are legacy route vocabulary, the same
// way the schema unified into orders.orders with a direction column.
// DIRECTION IS DATA, NOT ROUTING: one endpoint, and the service validates
// each operation against the order's direction.
//
// The final surface, one endpoint per resource:
//
//   PATCH  /api/orders/:id           this file - status (a pure label, both
//                                    directions), finalize_pricing / cancel /
//                                    add_funds (purchase), supplier (sale)
//   GET/PUT /api/orders/:id/spots    features/orders/spots - the frozen spots
//   GET/POST /api/orders/:id/items   features/orders/items - the lines
//   PATCH  /api/orders/items/:id     features/orders/items - a line's edits
//   DELETE /api/orders/items/:id     features/orders/items - a line's removal
//   GET    /api/orders/:id/address   features/orders/addresses - the snapshot
//   PATCH  /api/shipments/:id        shipping - the parcel's money + tracking
//   PATCH  /api/payouts/:id          payouts - cost and method
//   PATCH  /api/refiners/orders/:id  refiners - the engagement
//   PATCH  /api/refiners/items/...   refiners - premium + assay report
//
// THIS FILE IS THE ORDER ROW'S SERVICE AND NOTHING ELSE (ruling 26c). The
// spots PUT and the item POST that used to live here are in
// features/orders/spots/service.ts and features/orders/items/service.ts, with
// their own controllers and routes; their paths did not move.
//
// STATUS IS A PURE LABEL. Jacob, verbatim: "The stages don't really matter
// for admins... They shouldn't be driving logic AT ALL." A `status` field
// writes the column and its audit name via the direction's own service, and
// NOTHING else. The operations that used to hide behind transitions are
// explicit fields:
//
//   finalize_pricing: true    what accepting was - spots snapshotted or kept,
//                             refiner copies updated, every line priced, the
//                             total written with the pin. Server-resolved;
//                             no status write rides along.
//   cancel: {return_shipment} what cancelling was - the return label bought
//                             first and compensated if the database work
//                             fails, the return shipment recorded, the spots
//                             unpinned. No status write rides along; the
//                             admin labels 'Cancelled' explicitly, and status
//                             runs LAST so one document does both.
//   supplier: {supplier_id, send: true}
//                             the sale-side send, whole guard stack intact
//                             (404 / addressless / 409 different refiner /
//                             422 no email), spots for the refiner's copy
//                             resolved server-side.
//
// EVERYTHING requireAdmin. Customers have no order-management surface (the
// old owner cancel was never wired client-side), so ownership never enters
// these routes. A field an endpoint does not have - or a field the order's
// DIRECTION does not have - is refused with a 400 naming it, never dropped:
// the admin-mutation-urls bug (a value discarded and a different column
// erased) is the argument, everywhere on this surface.
//
// FIELD ORDER within the PATCH document: add_funds -> finalize_pricing ->
// cancel -> supplier -> status; the label last because it depends on nothing.
// Each field keeps the transaction semantics of the service it dispatches to
// - a failure names its field, prior fields stand, exactly as sequential
// clicking would have left things.
//
// FINALIZING PRICES SERVER-SIDE. The old accept_order route took order_spots
// and spot_prices out of the request body, and calculateTotalPrice reads
// item.price verbatim - so the request named the number the business would
// owe (features/purchase-orders/accept-offer-pricing.test.js measured it).
// Here the order comes from the database, its frozen spots from
// findMetalsByOrderId, and the live spots from getCurrentSpotPrices. The
// body's arrays are not ignored, they are refused: order_spots is not a field.
import * as ordersRepo from "#features/orders/repo.ts";
import * as orderRead from "#features/orders/read.ts";
import * as spotsFeed from "#features/spots/service.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";
import * as purchaseOrderService from "#features/purchase-orders/service.ts";
import * as salesOrderService from "#features/sales-orders/service.ts";

type Caller = { id: string; name?: string | null; role?: string | null };
type Direction = "purchase" | "sale";

// The purchase service's own OrderLike, derived rather than restated - see
// its header: "whatever the caller had", and here the caller has a row from
// getById, one of the two shapes that comment names.
type OrderArg = Parameters<typeof purchaseOrderService.finalizePricing>[0]["order"];

// Which direction an order is. orders.orders answers it since the read pivot
// (a12b76ed) - see features/orders/sql/direction_of.sql for the three-table
// UNION this replaced and why it was a legacy read.
export async function directionOf(orderId: string): Promise<Direction | null> {
  return (await ordersRepo.directionOf(orderId)) as Direction | null;
}

export type OrderPatch = {
  add_funds?: boolean;
  finalize_pricing?: boolean;
  cancel?: { return_shipment: Record<string, unknown> };
  supplier?: { supplier_id: string; send: boolean };
  /** A label and its audit name, nothing else - never a pipeline. */
  status?: string;
};

// The fields the document may name, and which direction each belongs to.
// `notes` is deliberately absent: no notes write exists today - the column is
// written at creation and projected on every read - and this endpoint does
// not invent one.
const FIELDS = ["add_funds", "finalize_pricing", "cancel", "supplier", "status"] as const;
const DIRECTION_OF_FIELD: Record<string, Direction | "both"> = {
  add_funds: "purchase",
  finalize_pricing: "purchase",
  cancel: "purchase",
  supplier: "sale",
  status: "both",
};

// The document check as a checkable answer: the refusal this document earns
// against an order of this direction, or null. Exported so the matrix can be
// asserted directly as well as over the wire.
export function refusedField(
  direction: Direction,
  body: Record<string, unknown>
): { statusCode: number; message: string } | null {
  for (const field of Object.keys(body ?? {})) {
    if (!(FIELDS as readonly string[]).includes(field)) {
      return { statusCode: 400, message: `"${field}" is not a field of an order PATCH` };
    }
    const owner = DIRECTION_OF_FIELD[field];
    if (owner !== "both" && owner !== direction) {
      return {
        statusCode: 400,
        message: `"${field}" is a ${owner}-direction operation and this is a ${direction} order`,
      };
    }
  }

  if (body.finalize_pricing !== undefined && body.finalize_pricing !== true) {
    return { statusCode: 400, message: `"finalize_pricing" is the operation's name: send true or omit it` };
  }

  if (body.cancel !== undefined) {
    const cancel = body.cancel as { return_shipment?: unknown } | null;
    if (typeof cancel !== "object" || cancel === null || !cancel.return_shipment) {
      return { statusCode: 400, message: `"cancel" needs a "return_shipment"` };
    }
  }

  if (body.supplier !== undefined) {
    const supplier = body.supplier as { send?: unknown } | null;
    // `send: true` is required rather than implied: attaching a refiner
    // WITHOUT sending them the order is not an operation that exists today.
    if (typeof supplier !== "object" || supplier === null || supplier.send !== true) {
      return { statusCode: 400, message: `"supplier" without "send": true is not an operation this endpoint has` };
    }
  }

  return null;
}

// One field's dispatch, named in the error when it fails. Deliberate 4xx
// messages pass through with their own statusCode; anything else keeps its
// stack and gains the field's name, which the log prints even where the
// client sees a generic 500.
async function op<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Error) {
      err.message = `${name}: ${err.message}`;
      throw err;
    }
    throw new Error(`${name}: ${String(err)}`);
  }
}

export async function patchOrder(
  orderId: string,
  body: OrderPatch & Record<string, unknown>,
  caller: Caller
): Promise<unknown> {
  const direction = await directionOf(orderId);
  if (!direction) refuse(404, `no order ${orderId}`);

  const refusal = refusedField(direction!, body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  if (body.add_funds === true) {
    // Re-read at dispatch time rather than reuse: the ledger credits
    // totals.total, and the credit must record what the order says NOW.
    await op("add_funds", async () => {
      const fresh = await purchaseOrderService.getById(orderId);
      if (!fresh) refuse(404, `no purchase order ${orderId}`);
      return purchaseOrderService.addFundsToAccount({ order: fresh as OrderArg });
    });
  }

  if (body.finalize_pricing === true) {
    await op("finalize_pricing", async () => {
      // Server-resolved, never the body: the frozen rows and the live spots.
      // finalizePricing itself chooses between them on spots_locked. Re-read
      // so a lock sent moments earlier through the spots sub-resource is
      // respected.
      const fresh = await purchaseOrderService.getById(orderId);
      if (!fresh) refuse(404, `no purchase order ${orderId}`);
      const order_spots = await purchaseOrderService.getMetalsForOrder(orderId);
      const spot_prices = await spotsFeed.getSpotPrices();
      return purchaseOrderService.finalizePricing({
        order: fresh as OrderArg, order_spots, spot_prices,
      });
    });
  }

  if (body.cancel) {
    // The existing cancel pipeline: label first, compensated if the database
    // work fails. It no longer labels the order - the admin's own `status`
    // field does, and it runs after this.
    await op("cancel", async () => {
      const fresh = await purchaseOrderService.getById(orderId);
      if (!fresh) refuse(404, `no purchase order ${orderId}`);
      return purchaseOrderService.cancelOrder({
        order: fresh as OrderArg,
        return_shipment: body.cancel!.return_shipment as Record<string, never>,
      });
    });
  }

  if (body.supplier) {
    await op("supplier", async () => {
      // The refiner's copy prints the order's own frozen spots - the rows the
      // browser used to read from get_order_metals and post back. The guard
      // stack (404 / addressless / 409 / 422) lives in the service itself.
      const spots = await salesOrderService.getMetalsForOrder(orderId);
      return salesOrderService.sendOrderToSupplier({
        order: { id: orderId },
        spots,
        supplier_id: body.supplier!.supplier_id,
      });
    });
  }

  if (body.status !== undefined) {
    // The label, through the direction's own service - each writes its
    // column and its audit name, nothing else. The session's name is the
    // audit value; the old routes took it from the body.
    await op("status", () =>
      direction === "purchase"
        ? purchaseOrderService.updateStatus({
            order: { id: orderId } as OrderArg,
            order_status: body.status!,
            user_name: (caller.name ?? null) as string,
          })
        : salesOrderService.updateStatus({
            order: { id: orderId } as never,
            order_status: body.status!,
            user_name: (caller.name ?? null) as string,
          })
    );
  }

  // THE SLIM ORDER (wave 3), the same shape GET /api/orders serves: the
  // orders.orders row plus totals. It was the composed order until the wire
  // slimmed - a PATCH answering in a shape no read returns would have been a
  // second wire for one resource.
  return await orderRead.getOne(orderId);
}

// PUT /api/orders/:id/spots MOVED to features/orders/spots/service.ts and
// POST /api/orders/:id/items to features/orders/items/service.ts (ruling
// 26c: "that should hit the order/items orchestrator (controller) and call the
// domain logic (service), not the orders ones"). Both paths are unchanged.
