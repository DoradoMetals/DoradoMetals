const fs = require("fs");
const path = require("path");
const { formatSalesOrderNumber } = require("../utils/formatOrderNumbers");

function renderTemplate(
  contentFile,
  { firstName = "there", url, offerExpiration }
) {
  const layoutPath = path.join(__dirname, "templates", "baseLayout.raw.html");
  const contentPath = path.join(__dirname, "templates", contentFile);

  const layout = fs.readFileSync(layoutPath, "utf8");
  const content = fs.readFileSync(contentPath, "utf8");

  const finalHtml = layout
    .replace("[BODY]", content)
    .replace(/\[First Name\]/g, firstName)
    .replace(/href=""/g, `href="${url}"`)
    .replace(/\[Offer Expiration\]/g, offerExpiration);

  return finalHtml;
}

// Specific email renderers
function renderAccountCreatedEmail({ firstName, url }) {
  return renderTemplate("accountCreated.raw.html", { firstName, url });
}

function renderResetPasswordEmail({ firstName, url }) {
  return renderTemplate("resetPassword.raw.html", { firstName, url });
}

function renderVerifyEmail({ firstName, url }) {
  return renderTemplate("verifyEmail.raw.html", { firstName, url });
}

function renderChangeEmail({ firstName, url }) {
  return renderTemplate("changeEmail.raw.html", { firstName, url });
}

function renderCreateAccountEmail({ firstName, url }) {
  return renderTemplate("createAccount.raw.html", { firstName, url });
}

function renderPurchaseOrderPlacedEmail({ firstName, url }) {
  return renderTemplate("purchaseOrderPlaced.raw.html", { firstName, url });
}

function renderSalesOrderPlacedEmail({ firstName, url }) {
  return renderTemplate("salesOrderPlaced.raw.html", { firstName, url });
}

function renderOfferSentEmail({ firstName, url, offerExpiration }) {
  return renderTemplate("offerSent.raw.html", {
    firstName,
    url,
    offerExpiration,
  });
}

function renderOfferAcceptedEmail({ firstName, url }) {
  return renderTemplate("offerAccepted.raw.html", { firstName, url });
}

function renderSalesOrderToSupplierEmail({ firstName, url, order, spots }) {
  const layoutPath = path.join(__dirname, "templates", "baseLayout.raw.html");
  const contentPath = path.join(
    __dirname,
    "templates",
    "salesOrderToSupplier.raw.html"
  );
  let layout = fs.readFileSync(layoutPath, "utf8");
  let content = fs.readFileSync(contentPath, "utf8");

  // 1) basic placeholders
  content = content
    .replace(/\[First Name\]/g, firstName)
    .replace(/href=""/g, `href="${url}"`);

  // 2) build shipping <tr>…</tr> rows
  const addr = order.address;
  const shippingHtml = [
    `<tr><td style="padding:4px 8px;"><strong>Street 1:</strong> ${addr.line_1}</td></tr>`,
    addr.line_2 &&
      `<tr><td style="padding:4px 8px;"><strong>Street 2:</strong> ${addr.line_2}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>City:</strong> ${addr.city}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>State:</strong> ${addr.state}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>Zip Code:</strong> ${addr.zip}</td></tr>`,
  ]
    .filter(Boolean)
    .join("");

  // 3) build spots <tr>…</tr> rows
  const spotsHtml = spots
    .map(
      (s) => `
    <tr>
      <td style="padding:4px 8px;">${s.type}</td>
      <td style="padding:4px 8px;text-align:right;">
        $${s.ask_spot.toFixed(2)}
      </td>
    </tr>
  `
    )
    .join("");

  // 4) build order‐item rows
  const orderRows = order.order_items
    .map((item) => {
      const subtotal = (item.quantity * item.price).toFixed(2);
      return `
      <tr>
        <td style="padding:8px 0">${item.product.product_name}</td>
        <td style="padding:8px 0;text-align:center">${item.quantity}</td>
        <td style="padding:8px 0;text-align:right">$${subtotal}</td>
      </tr>
    `;
    })
    .join("");

  // 5) total
  const total = order.item_total.toFixed(2);

  // 6) inject everything
  content = content
    .replace("[SHIPPING_ROWS]", shippingHtml)
    .replace("[SPOTS_ROWS]", spotsHtml)
    .replace("[ORDER_ROWS]", orderRows)
    .replace("[ORDER_TOTAL]", total)
    .replace("[ORDER_NUMBER]", formatSalesOrderNumber(order.order_number))
    .replace("[CUSTOMER_NAME]", order.user.user_name);

  return layout.replace("[BODY]", content);
}

module.exports = {
  renderAccountCreatedEmail,
  renderResetPasswordEmail,
  renderVerifyEmail,
  renderChangeEmail,
  renderCreateAccountEmail,
  renderPurchaseOrderPlacedEmail,
  renderSalesOrderPlacedEmail,
  renderOfferSentEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
};
