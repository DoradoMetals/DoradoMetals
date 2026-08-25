import * as pdfService from "#features/pdf/service.js";

import {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
} from "#features/emails/utils/renderEmail.js";

import { sendEmail } from "#features/emails/utils/sendEmail.js";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

// `transport` is a separate parameter, not a field on the input object: the
// controller passes req.body as the input, so a field would be reachable from
// the request. In production nothing passes one and the shared transport is
// used. See utils/sendEmail.js.
//
// payoutDetails used to be passed on to generatePackingList, which does not
// accept it - the packing list reads the fee off purchaseOrder.payout.cost. It
// is still accepted here because the frontend sends it, and dropping a field
// from a request body is a wire change.
export async function sendCreatedEmail(
  { purchaseOrder, spotPrices, packageDetails },
  transport
) {
  const pdfBuffer = await pdfService.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
  });

  await sendEmail({
    to: purchaseOrder.user.user_email,
    subject: "Your Order Has Been Placed!",
    html: renderPurchaseOrderPlacedEmail({
      firstName: purchaseOrder.user.user_name,
      url: `${process.env.FRONTEND_URL}/account?tab=sold`,
    }),
    attachments: [
      {
        filename: `${formatPurchaseOrderNumber(
          purchaseOrder.order_number
        )}_packing_list.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}

export async function sendAcceptedEmail(
  { order, order_spots, spot_prices, email },
  transport
) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfService.generateInvoice({
      purchaseOrder: order,
      orderSpots: order_spots,
      spotPrices: spot_prices,
    });
  } catch (err) {
    const msg = "[EmailService] invoice PDF generation failed";
    err.message = `${msg}: ${err.message}`;
    throw err;
  }

  await sendEmail({
    to: email,
    subject: `Offer Accepted - Order ${formatPurchaseOrderNumber(
      order.order_number
    )}`,
    html: renderOfferAcceptedEmail({
      firstName: order.user.user_name,
      url: `${process.env.FRONTEND_URL}/orders`,
    }),
    attachments: [
      {
        filename: `${formatPurchaseOrderNumber(
          order.order_number
        )}_invoice.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}

export async function sendSalesOrderToSupplier(order, spots, email, transport) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfService.generateSalesOrderInvoice({
      salesOrder: order,
      spots,
    });
  } catch (err) {
    const msg = "[EmailService] invoice PDF generation failed";
    err.message = `${msg}: ${err.message}`;
    throw err;
  }

  await sendEmail({
    to: email,
    subject: `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(
      order.order_number
    )}`,
    html: renderSalesOrderToSupplierEmail({
      firstName: order.user.user_name,
      url: `${process.env.FRONTEND_URL}/orders`,
      order,
      spots,
    }),
    attachments: [
      {
        filename: `${formatSalesOrderNumber(order.order_number)}_invoice.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}
