const pdfRepo = require("../repositories/pdfRepo");

const {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
} = require("../emails/renderEmail");

const { sendEmail } = require("../emails/sendEmail");
const {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} = require("../utils/formatOrderNumbers");

async function sendCreatedEmail({
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
    subject: "Your Order Has Been Placed!",
    html: renderPurchaseOrderPlacedEmail({
      firstName: purchaseOrder.user.user_name,
      url: `${process.env.FRONTEND_URL}/orders`,
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
  });
}

async function sendAcceptedEmail({ order, order_spots, spot_prices }) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfRepo.generateInvoice({
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
    subject: "",
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
  });
}

async function sendSalesOrderToSupplier(order, spots, email) {
  let pdfBuffer;
  try {
    pdfBuffer = await pdfRepo.generateSalesOrderInvoice({
      salesOrder: order,
      spots: spots,
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
      order: order,
      spots: spots,
    }),
    attachments: [
      {
        filename: `${formatSalesOrderNumber(
          order.order_number
        )}_invoice.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

module.exports = {
  sendCreatedEmail,
  sendAcceptedEmail,
  sendSalesOrderToSupplier,
};
