// PATCH /api/orders/:id - the order mutation surface, both directions. Each
// field is an OPERATION dispatching to its own use case; `status` is a pure
// label writing one column (Jacob: statuses drive no logic).
//
//   add_funds -> add-funds.ts | finalize_pricing -> finalize-pricing.ts
//   cancel -> cancel.ts | supplier -> send-to-refiner.ts | status -> the label
//
// DIRECTION IS DATA, NOT ROUTING: one endpoint, and the document is validated
// against the ORDER's direction. A field it does not have is a 400 naming it,
// never a silent drop. ADMIN-ONLY; every number is server-resolved.
import * as ordersRepo from "#db/orders/repo.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as readService from "#domain/orders/read.service.ts";
import * as orderSpots from "#domain/orders/spots/service.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import { addFundsToAccount } from "#domain/orders/add-funds.ts";
import { finalizePricing } from "#domain/orders/finalize-pricing.ts";
import { cancelOrder } from "#domain/orders/cancel.ts";
import { sendOrderToRefiner } from "#domain/orders/send-to-refiner.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { OrderPatch, type orders } from "@dorado/contracts";

// Read from the generated row rather than restated (D103).
type Direction = NonNullable<orders.OrdersRow["direction"]>;

export type { OrderPatch } from "@dorado/contracts";

export async function directionOf(orderId: string): Promise<Direction | null> {
  return (await ordersRepo.directionOf(orderId)) as Direction | null;
}

// THE CONTRACT'S OWN KEYS, so a field added to one and not the other is not
// expressible. `notes` is absent because no notes write exists today.
const FIELDS = Object.keys(OrderPatch.shape);
const DIRECTION_OF_FIELD: Record<string, Direction | "both"> = {
  add_funds: "purchase",
  finalize_pricing: "purchase",
  cancel: "purchase",
  supplier: "sale",
  status: "both",
};

// The refusal this document earns against an order of this direction, or null.
// Exported so the matrix can be asserted directly as well as over the wire.
export function refusedField(
  direction: Direction,
  body: Record<string, unknown>
): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "an order PATCH");
  if (unknown) return unknown;

  // Checked here rather than in the contract: which fields a document may carry
  // depends on the ORDER, which no schema can see.
  for (const field of Object.keys(body ?? {})) {
    const owner = DIRECTION_OF_FIELD[field];
    if (owner !== "both" && owner !== direction) {
      return {
        statusCode: 400,
        message: `"${field}" is a ${owner}-direction operation and this is a ${direction} order`,
      };
    }
  }

  // Bespoke messages run BEFORE the contract: each says what the operation is
  // for, which "invalid input" cannot.
  if (body.finalize_pricing !== undefined && body.finalize_pricing !== true) {
    return { statusCode: 400, message: `"finalize_pricing" is the operation's name: send true or omit it` };
  }
  if (body.add_funds !== undefined && body.add_funds !== true) {
    return { statusCode: 400, message: `"add_funds" is the operation's name: send true or omit it` };
  }

  if (body.cancel !== undefined) {
    const cancel = body.cancel as { return_shipment?: unknown } | null;
    if (typeof cancel !== "object" || cancel === null || !cancel.return_shipment) {
      return { statusCode: 400, message: `"cancel" needs a "return_shipment"` };
    }
  }

  if (body.supplier !== undefined) {
    const supplier = body.supplier as { send?: unknown } | null;
    // `send: true` is required: attaching without sending is not an operation.
    if (typeof supplier !== "object" || supplier === null || supplier.send !== true) {
      return { statusCode: 400, message: `"supplier" without "send": true is not an operation this endpoint has` };
    }
  }

  return refusedValue(OrderPatch, body ?? {});
}

// One field's dispatch, named in the error when it fails. A deliberate 4xx keeps
// its statusCode; anything else keeps its stack and gains the field's name.
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

async function requirePurchase(orderId: string) {
  const fresh = await readService.findPurchaseById(orderId);
  if (!fresh) refuse(404, `no purchase order ${orderId}`);
  return fresh!;
}

export async function patchOrder(
  orderId: string,
  body: OrderPatch & Record<string, unknown>
): Promise<unknown> {
  const direction = await directionOf(orderId);
  if (!direction) refuse(404, `no order ${orderId}`);

  const refusal = refusedField(direction!, body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  if (body.add_funds === true) {
    // Re-read at dispatch: the credit must record what the order says NOW.
    await op("add_funds", async () =>
      addFundsToAccount({ order: (await requirePurchase(orderId)) as never })
    );
  }

  if (body.finalize_pricing === true) {
    await op("finalize_pricing", async () => {
      // Server-resolved, never the body. Re-read so a lock sent moments earlier
      // through the spots sub-resource is respected.
      const fresh = await requirePurchase(orderId);
      return finalizePricing({
        order: fresh as never,
        order_spots: await orderSpots.namedFor(orderId),
        spot_prices: await spotsFeed.getSpotPrices(),
      });
    });
  }

  if (body.cancel) {
    // Label first, compensated if the database work fails. It writes no status;
    // the admin's own `status` field does, and it runs after this.
    await op("cancel", async () => {
      await requirePurchase(orderId);
      return cancelOrder({
        order: { id: orderId },
        return_shipment: body.cancel!.return_shipment as Record<string, never>,
      });
    });
  }

  if (body.supplier) {
    await op("supplier", async () =>
      sendOrderToRefiner({
        order: { id: orderId },
        spots: await orderSpots.namedFor(orderId),
        supplier_id: body.supplier!.supplier_id,
      })
    );
  }

  if (body.status !== undefined) {
    // ONE STATEMENT, AND STILL A TRANSACTION: the audit actor reaches the
    // connection through withTransaction's set_config and nowhere else (116).
    await op("status", () =>
      withTransaction((c) => ordersRepo.update(orderId, { status: body.status! }, {}, c))
    );
  }

  // The slim order, the same shape GET /api/orders serves: a PATCH answering in
  // a shape no read returns would be a second wire for one resource.
  return await orderRead.getOne(orderId);
}
