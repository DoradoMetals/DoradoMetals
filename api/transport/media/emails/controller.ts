import type { Request } from "express";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { strictBody } from "#shared/http/validate.ts";
import * as emailService from "#domain/media/emails/service.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import * as orderRead from "#domain/orders/read.ts";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import { z } from "zod/v4";

// WHO THE EMAIL GOES TO IS DECIDED HERE, FROM THE DATABASE.
//
// Both routes are requireUser and both used to take the recipient from the
// request body, which made this an open mail relay on the business's domain.
// The address now comes from the stored order, and the caller has to be
// entitled to it: an admin may send on a customer's behalf, anyone else only
// about their own order. Otherwise naming somebody else's order id would be a
// way to mail that customer at will.
async function recipientFor(
  order_id: string,
  caller: Request["user"]
): Promise<string> {
  const order = await orderRead.view(order_id);
  if (!order) throw new NotFound(`no order ${order_id}`);

  const ownsIt = order.order.user_id === caller?.id;
  if (!ownsIt && caller?.role !== "admin") {
    throw new Forbidden(`order ${order_id} is not yours`);
  }

  const to = order.user?.email;
  if (!to) throw new Invalid("the order has no customer email on record");
  return to;
}

// The body is one id (ruling 10). It used to be the whole composed order plus
// the spot feed plus the recipient.
const Body = z.object({ order_id: z.string() }).strict();

export const sendCreatedEmail = asyncHandler(async (req, res) => {
  const { order_id } = strictBody(Body, req.body);
  const to = await recipientFor(order_id, req.user);
  await emailService.sendCreatedEmail(await inputs.packingListInputs(order_id), to);
  return res.status(200).json({ success: true });
});

export const sendPricedEmail = asyncHandler(async (req, res) => {
  const { order_id } = strictBody(Body, req.body);
  const to = await recipientFor(order_id, req.user);
  await emailService.sendPricedEmail(await inputs.invoiceInputs(order_id), to);
  return res.status(200).json({ success: true });
});
