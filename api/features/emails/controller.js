import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as emailService from "#features/emails/service.js"
import * as purchaseOrderRepo from "#features/purchase-orders/repo.js";

// WHO THE EMAIL GOES TO IS DECIDED HERE, FROM THE DATABASE.
//
// Both routes are requireUser and both used to take the recipient from the
// request body, which made this an open mail relay on the business's domain.
// The address now comes from the stored order, and the caller has to be
// entitled to it: an admin may send on a customer's behalf, anyone else only
// about their own order. Otherwise naming somebody else's order id would be a
// way to mail that customer at will.
async function recipientFor(orderId, caller) {
  const fail = (status, message) => {
    const err = new Error(message);
    err.statusCode = status;
    return err;
  };

  if (!orderId) throw fail(400, "an order id is required to send this email");

  const stored = await purchaseOrderRepo.findById(orderId);
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

export const sendAcceptedEmail = asyncHandler(async (req, res) => {
  const to = await recipientFor(req.body?.order?.id, req.user);
  await emailService.sendAcceptedEmail(req.body, to);
  return res.status(200).json({ success: true });
});
