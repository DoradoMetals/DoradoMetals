// IS THIS FULFILLMENT YOURS? Authorization lives in transport (ruling 46), and
// this is the one question the customer-facing handover surfaces ask.
//
// A fulfillment carries no user of its own. A DRAFT is owned by the checkout
// that points at it; an ATTACHED one is owned by its order. Both are asked, in
// that order, because a draft becomes an order's the moment it is placed and a
// screen may still hold its id.
//
// NotFound rather than Forbidden, deliberately: telling the two apart would
// confirm that somebody else's fulfillment exists.
import { NotFound } from "#shared/errors.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { Request } from "express";

export async function requireFulfillmentOwner(
  req: Request, fulfillment_id: string
): Promise<void> {
  if (req.user?.role === "admin") return;
  const caller = req.user?.id;
  const owner =
    (await checkoutService.ownerOfFulfillment(fulfillment_id))?.user_id
    ?? (await fulfillmentService.orderOwnerOf(fulfillment_id));
  if (!caller || owner !== caller) {
    throw new NotFound(`no such fulfillment: ${fulfillment_id}`);
  }
}
