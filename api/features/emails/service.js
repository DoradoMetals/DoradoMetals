import * as pdfService from "#features/pdf/service.ts";

import {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
} from "#features/emails/utils/renderEmail.ts";

import { sendEmail } from "#features/emails/utils/sendEmail.ts";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

// `transport` is a separate parameter, not a field on the input object: the
// controller passes req.body as the input, so a field would be reachable from
// the request. In production nothing passes one and the shared transport is
// used. See utils/sendEmail.ts.
//
// payoutDetails used to be passed on to generatePackingList, which does not
// accept it - the packing list reads the fee off purchaseOrder.payout.cost. It
// is still accepted here because the frontend sends it, and dropping a field
// from a request body is a wire change.
// `to` IS A PARAMETER, NOT A FIELD OF THE BODY.
//
// This sent to `purchaseOrder.user.user_email`, an address out of req.body,
// behind requireUser. Any signed-in account could send mail FROM the business's
// own domain TO any address it named, subject "Your Order Has Been Placed!",
// with a PDF attachment it also supplied - an open relay and a ready-made
// phishing template, at the cost of the sending domain's reputation.
//
// The recipient is now resolved and authorised by the controller, from the
// stored order, and handed in. Same seam as `transport`: a separate parameter
// rather than a field on the input object, because the input object IS req.body
// and anything read off it can be chosen by the caller.
export async function sendCreatedEmail(
  { purchaseOrder, spotPrices, packageDetails },
  to,
  transport
) {
  const pdfBuffer = await pdfService.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
  });

  await sendEmail({
    to,
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

// Same change, and this one was more direct: `email` came off the body and went
// straight into `to:`.
export async function sendAcceptedEmail(
  { order, order_spots, spot_prices },
  to,
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
    to,
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
    // `email` here is not from a request body - sendSalesOrderToSupplier is not
    // a route. It is called with the refiner's address the order was placed
    // against, and it already took it as an explicit parameter.
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
