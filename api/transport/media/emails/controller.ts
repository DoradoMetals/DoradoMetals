import type { Request } from "express";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as emailService from "#domain/media/emails/service.ts"
import * as purchaseOrderReads from "#domain/orders/read.service.ts";

// WHO THE EMAIL GOES TO IS DECIDED HERE, FROM THE DATABASE.
//
// Both routes are requireUser and both used to take the recipient from the
// request body, which made this an open mail relay on the business's domain.
// The address now comes from the stored order, and the caller has to be
// entitled to it: an admin may send on a customer's behalf, anyone else only
// about their own order. Otherwise naming somebody else's order id would be a
// way to mail that customer at will.
async function recipientFor(
  orderId: string | undefined,
  caller: Request["user"]
): Promise<string> {
  const fail = (status: number, message: string) => {
    const err: Error & { statusCode?: number } = new Error(message);
    err.statusCode = status;
    return err;
  };

  if (!orderId) throw fail(400, "an order id is required to send this email");

  const stored = (await purchaseOrderReads.findPurchaseById(orderId)) as {
    user_id?: string | null;
    user?: { id?: string | null; user_email?: string | null } | null;
  } | null;
  if (!stored) throw fail(404, "no such order");

  const ownsIt = stored.user?.id === caller?.id || stored.user_id === caller?.id;
  if (!ownsIt && caller?.role !== "admin") throw fail(403, "Forbidden");

  const to = stored.user?.user_email;
  if (!to) throw fail(422, "the order has no customer email on record");

  return to;
}

export const sendCreatedEmail = asyncHandler(async (req, res) => {
  const to = await recipientFor(req.body?.purchaseOrder?.id, req.user);
  await emailService.sendCreatedEmail(req.body, to);
  return res.status(200).json({ success: true });
});

export const sendPricedEmail = asyncHandler(async (req, res) => {
  const to = await recipientFor(req.body?.order?.id, req.user);
  await emailService.sendPricedEmail(req.body, to);
  return res.status(200).json({ success: true });
});
