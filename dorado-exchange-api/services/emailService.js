import * as pdfRepo from '../repositories/pdfRepo.js';

import {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
} from '../emails/renderEmail.js';

import { sendEmail } from '../emails/sendEmail.js';
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '../utils/formatOrderNumbers.js';

export async function sendCreatedEmail({
  purchaseOrder,
  spotPrices,
  packageDetails,
  payoutDetails,
}) {
  const pdfBuffer = await pdfRepo.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
    payoutDetails,
  });

  await sendEmail({
    to: purchaseOrder.user.user_email,
    subject: 'Your Order Has Been Placed!',
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
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendAcceptedEmail({ order, order_spots, spot_prices, email }) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfRepo.generateInvoice({
      purchaseOrder: order,
      orderSpots: order_spots,
      spotPrices: spot_prices,
    });
  } catch (err) {
    const msg = '[EmailService] invoice PDF generation failed';
    err.message = `${msg}: ${err.message}`;
    throw err;
  }

  await sendEmail({
    to: email,
    subject: `Offer Accepted - Order ${formatPurchaseOrderNumber(order.order_number)}`,
    html: renderOfferAcceptedEmail({
      firstName: order.user.user_name,
      url: `${process.env.FRONTEND_URL}/orders`,
    }),
    attachments: [
      {
        filename: `${formatPurchaseOrderNumber(order.order_number)}_invoice.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendSalesOrderToSupplier(order, spots, email) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfRepo.generateSalesOrderInvoice({
      salesOrder: order,
      spots,
    });
  } catch (err) {
    const msg = '[EmailService] invoice PDF generation failed';
    err.message = `${msg}: ${err.message}`;
    throw err;
  }

  await sendEmail({
    to: email,
    subject: `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.order_number)}`,
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
        contentType: 'application/pdf',
      },
    ],
  });
}
