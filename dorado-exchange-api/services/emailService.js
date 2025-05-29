const axios = require("axios");

const {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
} = require("../emails/renderEmail");

const { sendEmail } = require("../emails/sendEmail");
const { formatPurchaseOrderNumber } = require("../utils/formatOrderNumbers");

async function _fetchPdf(endpoint, payload) {
  const resp = await axios.post(
    `${process.env.API_URL}/pdf/${endpoint}`,
    payload,
    {
      responseType: "arraybuffer",
    }
  );
  return Buffer.from(resp.data, "binary");
}

async function sendCreatedEmail({
  purchaseOrder,
  spotPrices,
  packageDetails,
  payoutDetails,
}) {
  const pdfBuffer = await _fetchPdf("generate_packing_list", {
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
    pdfBuffer = await _fetchPdf("generate_invoice", {
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
    to: order.user.user_email,
    subject: "Offer Accepted!",
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

module.exports = {
  sendCreatedEmail,
  sendAcceptedEmail,
};
