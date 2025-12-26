import puppeteer from "puppeteer";
import {
  calculateTotalPrice,
  calculateItemPrice,
  getBullionTotal,
  getScrapTotal,
} from "#features/purchase-orders/utils/calculations.js";

import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.js";
import { assignScrapItemNames } from "#features/scrap/utils/assignScrapNames.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateBoxSVG } from "#features/pdf/utils/generateBoxSVG.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function dataUriFromAssets(relPath, mime) {
  const absPath = path.join(__dirname, "..", "..", "shared", "assets", relPath);
  const file = fs.readFileSync(absPath);
  return `data:${mime};base64,${file.toString("base64")}`;
}

const LOGO_SRC = dataUriFromAssets("full.svg", "image/svg+xml");
const ICON_PIN_SRC = dataUriFromAssets("pin.svg", "image/svg+xml");
const ICON_PHONE_SRC = dataUriFromAssets("phone.svg", "image/svg+xml");
const ICON_URL_SRC = dataUriFromAssets("url.svg", "image/svg+xml");
const ICON_EMAIL_SRC = dataUriFromAssets("email.svg", "image/svg+xml");

export function getItemPrice(content, premium, bid_spot) {
  if (!bid_spot || !premium || !content) return 0;
  return content * (bid_spot * premium);
}

export function getPayoutDelay(method) {
  if (method === "WIRE") return "1-5 hours";
  if (method === "ACH") return "1-24 hours";
  return "Instant";
}

function renderHeader() {
  const phone = formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER);

  return `
    <div class="header">
      <div class="header-content">
        <div class="logo">
          <img
            src="${LOGO_SRC}"
            alt="Dorado Metals Exchange"
            class="brand-logo"
          />
        </div>

        <div class="header-contact">
          <div class="header-contact-row">
            <img src="${ICON_PIN_SRC}" alt="Address" class="header-contact-icon" />
            <span>3169 Royal Ln, Dallas, TX 75229</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_PHONE_SRC}" alt="Phone" class="header-contact-icon" />
            <span>${phone}</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_URL_SRC}" alt="Website" class="header-contact-icon" />
            <span>www.doradometals.com</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_EMAIL_SRC}" alt="Email" class="header-contact-icon" />
            <span>support@doradometals.com</span>
          </div>
        </div>
      </div>

      <div class="header-divider"></div>
    </div>
  `;
}

function renderShell({ title, subtitle, bodyHtml }) {
  return `
    <html>
      <head>
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="page">
          ${renderHeader()}
          <div class="packing-title">${title}</div>
          ${subtitle ? `<div class="packing-subtitle">${subtitle}</div>` : ""}
          ${bodyHtml}
        </div>
      </body>
    </html>
  `;
}

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

  body {
    font-family: 'Poppins', Arial, sans-serif;
    background: white;
  }
  .page {
    background: white;
    position: relative;
  }

  .header {
    padding: 12px 0 10px 0;
    margin-bottom: 16px;
  }
  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .brand-logo {
    height: 70px;
  }
  .header-contact {
    margin-left: auto; 
    display: flex;
    gap: 4px;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    font-size: 12px;
    color: #555;
  }
  .header-contact-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .header-contact-icon {
    width: 14px;
    height: 14px;
    color: #debb59;
  }
  .header-divider {
    margin-top: 10px;
    height: 2px;
    background: #debb59;
  }


  .packing-title {
    font-size: 20px;
    font-weight: bold;
    margin-top: 10px;
    margin-bottom: 5px;
  }
  .packing-subtitle {
    font-size: 12px;
    margin-bottom: 20px;
  }
  .shipping-info {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    margin-bottom: 20px;
  }
  .shipping-box {
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    border-radius: 0;
    width: 30%;
    font-size: 12px;
    margin: 0;
  }
  .shipping-box h3 {
    background: #debb59;
    color: white;
    margin: 0;
    padding: 5px;
    font-size: 12px;
  }
  .shipping-box h4 {
    font-size: 14px;
    margin: 0 0 12px 0;
    font-weight: 600;
  }
  .shipping-box p {
    font-size: 12px;
    margin: 0;
    margin-top: 8px;
    line-height: 1.4;
  }
  .shipping-box div {
    padding: 10px;
  }
  .details {
    display: flex;
    flex-direction: column;
    width: 40%;
    padding: 0;
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    font-size: 12px;
  }
  .details h3 {
    background: #debb59;
    color: white;
    margin: 0;
    padding: 5px;
    font-size: 12px;
    text-align: left;
  }
  .detail-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
  }
  .detail-label {
    font-weight: normal;
    white-space: nowrap;
  }
  .detail-value {
    font-weight: 600;
  }
  .order-info, .table-container {
    margin-bottom: 20px;
  }
  .section-header {
    background: #debb59;
    color: white;
    padding: 8px;
    font-weight: bold;
    font-size: 14px;
    border-radius: 5px 5px 0 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    padding: 8px;
    text-align: center;
  }
  th {
    border: none;
    background: #debb59;
    color: white;
  }
  td {
    border: none;
  }
  table tr:nth-child(even) {
    background-color: #f5f5f5;
  }
  .order-info table {
    width: 100%;
    table-layout: fixed;
  }
  .order-info th,
  .order-info td {
    width: 33%;
  }
  .text-right { text-align: right; }
  .text-left { text-align: left; }
  .text-bold { font-weight: bold; font-size: 12px; }

  .step { display: flex; flex-direction: column; }
  .step h3 { margin: 4px; }
  .step p { margin-top: 0; margin-bottom: 32px; }

  .package-area {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 50px;
    width: 100%;
    align-items: center;
    margin-bottom: 50px;
  }
  .package-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .package-details-title {
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .invoice-header {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }
  .invoice-card {
    flex: 1;
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    font-size: 11px;
  }
  .invoice-card-title {
    background: #debb59;
    color: white;
    padding: 5px;
    font-weight: bold;
    font-size: 12px;
  }
  .invoice-card-body {
    padding: 8px 10px;
    line-height: 1.4;
  }
  .invoice-card-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
  }
  .invoice-card-row span:last-child {
    font-weight: 600;
  }
`;

function renderInvoiceHeader(purchaseOrder, total, spots = []) {
  const orderPlaced = new Date(purchaseOrder.created_at).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  const orderNumber = `PO-${purchaseOrder.order_number
    .toString()
    .padStart(6, "0")}`;
  const status =
    purchaseOrder.purchase_order_status ?? purchaseOrder.status ?? "";
  const userName = purchaseOrder.user?.user_name ?? "";

  const doneStatus = ["Accepted", "Payment Processing", "Completed"];
  const isDone = doneStatus.includes(status);
  const offerLabel = isDone ? "Total Payout" : "Total Estimate";

  const offerStatus = purchaseOrder.offer_status ?? "N/A";
  const sentAt = purchaseOrder.offer_sent_at
    ? new Date(purchaseOrder.offer_sent_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";
  const expiresAt = purchaseOrder.offer_expires_at
    ? new Date(purchaseOrder.offer_expires_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";
  const rejections = purchaseOrder.num_rejections ?? 0;

  const metals = ["Gold", "Silver", "Platinum", "Palladium"];
  const spotRows =
    metals
      .map((m) => {
        const spot = spots.find((s) => s.type === m);
        if (!spot?.bid_spot) return null;
        return `
          <div class="invoice-card-row">
            <span>${m}:</span>
            <span>${formatCurrency(spot.bid_spot)}</span>
          </div>
        `;
      })
      .filter(Boolean)
      .join("") ||
    `<div class="invoice-card-row"><span>Spots unavailable</span></div>`;

  const spotsStatus = purchaseOrder.spots_locked ? "Locked" : "Unlocked";

  return `
    <div class="invoice-header">
      <div class="invoice-card">
        <div class="invoice-card-title">Order</div>
        <div class="invoice-card-body">
          <div class="invoice-card-row">
            <span>Number:</span>
            <span>${orderNumber}</span>
          </div>
          <div class="invoice-card-row">
            <span>Name:</span>
            <span>${userName}</span>
          </div>
          <div class="invoice-card-row">
            <span>Placed:</span>
            <span>${orderPlaced}</span>
          </div>
          <div class="invoice-card-row">
            <span>Status:</span>
            <span>${status}</span>
          </div>
          <div class="invoice-card-row">
            <span>Items:</span>
            <span>${purchaseOrder.order_items.length}</span>
          </div>
        </div>
      </div>

      <div class="invoice-card">
        <div class="invoice-card-title">Offer</div>
        <div class="invoice-card-body">
          <div class="invoice-card-row">
            <span>${offerLabel}:</span>
            <span>${formatCurrency(total)}</span>
          </div>
          <div class="invoice-card-row">
            <span>Status:</span>
            <span>${offerStatus}</span>
          </div>
          <div class="invoice-card-row">
            <span>Sent:</span>
            <span>${sentAt}</span>
          </div>
          <div class="invoice-card-row">
            <span>Expires:</span>
            <span>${expiresAt}</span>
          </div>
          <div class="invoice-card-row">
            <span>Rejections:</span>
            <span>${rejections}</span>
          </div>
        </div>
      </div>

      <div class="invoice-card">
        <div class="invoice-card-title">Spots</div>
        <div class="invoice-card-body">
          <div class="invoice-card-row">
            <span>Status:</span>
            <span>${spotsStatus}</span>
          </div>
          ${spotRows}
        </div>
      </div>
    </div>
  `;
}

function renderInvoiceShippingAndPayout(purchaseOrder, { payoutCost }) {
  const inbound = purchaseOrder.shipment;
  const outbound = purchaseOrder.return_shipment;
  const isCancelled = purchaseOrder.purchase_order_status === "Cancelled";

  const inboundRow = inbound
    ? `
      <tr>
        <td class="text-left">Inbound</td>
        <td>${inbound.shipping_service || "-"}</td>
        <td>${inbound.insured ? "Yes" : "No"}</td>
        <td>${inbound.package || "-"}</td>
        <td class="text-right">${formatCurrency(inbound.shipping_charge)}</td>
      </tr>`
    : "";

  const outboundRow =
    isCancelled && outbound
      ? `
      <tr>
        <td class="text-left">Return</td>
        <td>${outbound.shipping_service || "-"}</td>
        <td>${outbound.insured ? "Yes" : "No"}</td>
        <td>${outbound.package || "-"}</td>
        <td class="text-right">${formatCurrency(
          outbound.shipping_charge ?? 0
        )}</td>
      </tr>`
      : "";

  const payoutMethod = purchaseOrder.payout.method;
  const payoutDelay = getPayoutDelay(payoutMethod);

  return `
    <div class="order-info">
      <table>
        <thead>
          <tr>
            <th class="text-left">Shipping Type</th>
            <th>Service</th>
            <th>Insured</th>
            <th>Packaging</th>
            <th class="text-right">Charges</th>
          </tr>
        </thead>
        <tbody>
          ${inboundRow}
          ${outboundRow}
        </tbody>
      </table>
    </div>

    <div class="order-info">
      <table>
        <thead>
          <tr>
            <th class="text-left">Payout Method</th>
            <th>Transfer Time</th>
            <th class="text-right">Charges</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="text-left">${payoutMethod}</td>
            <td>${payoutDelay}</td>
            <td class="text-right">${formatCurrency(payoutCost ?? 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPackingShippingSection(
  purchaseOrder,
  { isReturn = false, includePayoutFee = false, payoutFee = 0 } = {}
) {
  const fromIsCustomer = !isReturn;

  const fromName = fromIsCustomer
    ? purchaseOrder.address.name
    : process.env.FEDEX_DORADO_NAME;

  const fromLine1 = fromIsCustomer
    ? purchaseOrder.address.line_1
    : process.env.FEDEX_RETURN_ADDRESS_LINE_1;

  const fromLine2 = fromIsCustomer
    ? purchaseOrder.address.line_2 || ""
    : process.env.FEDEX_RETURN_ADDRESS_LINE_2 || "";

  const fromCity = fromIsCustomer
    ? purchaseOrder.address.city
    : process.env.FEDEX_RETURN_CITY;

  const fromState = fromIsCustomer
    ? purchaseOrder.address.state
    : process.env.FEDEX_RETURN_STATE;

  const fromZip = fromIsCustomer
    ? purchaseOrder.address.zip
    : process.env.FEDEX_RETURN_ZIP;

  const fromPhone = fromIsCustomer
    ? purchaseOrder.address.phone_number
    : process.env.FEDEX_DORADO_PHONE_NUMBER;

  const toName = fromIsCustomer
    ? process.env.FEDEX_DORADO_NAME
    : purchaseOrder.address.name;

  const toLine1 = fromIsCustomer
    ? process.env.FEDEX_RETURN_ADDRESS_LINE_1
    : purchaseOrder.address.line_1;

  const toLine2 = fromIsCustomer
    ? process.env.FEDEX_RETURN_ADDRESS_LINE_2 || ""
    : purchaseOrder.address.line_2 || "";

  const toCity = fromIsCustomer
    ? process.env.FEDEX_RETURN_CITY
    : purchaseOrder.address.city;

  const toState = fromIsCustomer
    ? process.env.FEDEX_RETURN_STATE
    : purchaseOrder.address.state;

  const toZip = fromIsCustomer
    ? process.env.FEDEX_RETURN_ZIP
    : purchaseOrder.address.zip;

  const toPhone = fromIsCustomer
    ? process.env.FEDEX_DORADO_PHONE_NUMBER
    : purchaseOrder.address.phone_number;

  const shipment = isReturn
    ? purchaseOrder.return_shipment
    : purchaseOrder.shipment;

  const pickupType = shipment?.pickup_type || "-";

  return `
    <div class="shipping-info">
      <div class="shipping-box">
        <h3>Shipping From:</h3>
        <div>
          <h4>${fromName}</h4>
          <p>
            ${fromLine1} ${fromLine2}<br/>
            ${fromCity}, ${fromState} ${fromZip}
          </p>
          <p>${formatPhoneNumber(fromPhone)}</p>
        </div>
      </div>

      <div class="shipping-box">
        <h3>Shipping To:</h3>
        <div>
          <h4>${toName}</h4>
          <p>
            ${toLine1} ${toLine2}<br/>
            ${toCity}, ${toState} ${toZip}
          </p>
          <p>${formatPhoneNumber(toPhone)}</p>
        </div>
      </div>

      <div class="details">
        <h3>Shipment Details:</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Tracking Number:</span>
            <span class="detail-value">${
              shipment?.tracking_number || "-"
            }</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Service:</span>
            <span class="detail-value">${
              shipment?.shipping_service || "-"
            }</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Package Size:</span>
            <span class="detail-value">${shipment?.package || "-"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Pickup Type:</span>
            <span class="detail-value">${pickupType}</span>
          </div>
          ${
            pickupType === "Store Dropoff"
              ? ""
              : `
          <div class="detail-row">
            <span class="detail-label">Pickup Date:</span>
            <span class="detail-value">
              8:30AM ${new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>`
          }
          <div class="detail-row">
            <span class="detail-label">Shipping Cost:</span>
            <span class="detail-value">${formatCurrency(
              shipment?.shipping_charge
            )}</span>
          </div>
          ${
            includePayoutFee && payoutFee > 0
              ? `
          <div class="detail-row">
            <span class="detail-label">Payout Fee:</span>
            <span class="detail-value">${formatCurrency(payoutFee)}</span>
          </div>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function formatCurrency(value) {
  if (value == null) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function renderPdf(html, pdfOptions = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
    footerTemplate: `<div></div>`,
    margin: { top: "20px", bottom: "20px", left: "15px", right: "15px" },
    ...pdfOptions,
  });

  await browser.close();
  return pdfBuffer;
}

function renderOrderSummaryTable(purchaseOrder, totalDisplay) {
  return `
    <div class="order-info order-summary">
      <table>
        <thead>
          <tr>
            <th>Order Placed</th>
            <th>Order Number</th>
            <th>Total Estimate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${new Date(purchaseOrder.created_at).toLocaleDateString()}</td>
            <td>PO-${purchaseOrder.order_number
              .toString()
              .padStart(6, "0")}</td>
            <td>${totalDisplay}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildPackingScrapRows(orderItems, spotPrices) {
  const rawScrapItems = orderItems.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);

  return scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spotPrices.find((s) => s.type === scrap.metal);
      const price =
        item.price != null
          ? item.price
          : getItemPrice(
              scrap.content,
              item.premium ?? item.scrap.bid_premium,
              spot?.bid_spot
            );

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt || "-"} ${scrap.gross_unit || ""}</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)}</td>
          <td>${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");
}

function buildPackingBullionRows(orderItems, spotPrices) {
  return orderItems
    .filter((item) => item.item_type === "product" && item.product)
    .map((item) => {
      const product = item.product || {};
      const spot = spotPrices.find((s) => s.type === product.metal_type);
      const unitPrice =
        item.price != null
          ? item.price
          : getItemPrice(
              product.content,
              item.premium ?? product.bid_premium,
              spot?.bid_spot
            );
      const totalPrice = unitPrice * (item.quantity ?? 1);

      return `
        <tr>
          <td>${product.product_name || "Bullion Product"}</td>
          <td>${product.metal_type || "-"}</td>
          <td>${item.quantity}</td>
          <td>${product.content || "-"}</td>
          <td>${totalPrice ? formatCurrency(totalPrice) : "-"}</td>
        </tr>`;
    })
    .join("");
}

function buildInvoiceScrapRows(orderItems, spots) {
  const rawScrapItems = orderItems.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);

  const rowsHtml = scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const price =
        item.price != null ? item.price : calculateItemPrice(item, spots);

      return `
        <tr>
          <td class="text-left">${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt} ${scrap.gross_unit || ""}</td>
          <td>${scrap.post_melt ?? scrap.pre_melt} ${
        scrap.gross_unit || ""
      }</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)} t oz</td>
          <td>${(item.premium * 100).toFixed(1)}%</td>
          <td class="text-right">${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");

  return { rowsHtml, rawScrapItems };
}

function buildInvoiceBullionRows(orderItems, spots) {
  const bullionOrderItems = orderItems.filter(
    (item) => item.item_type === "product" && item.product
  );

  const rowsHtml = bullionOrderItems
    .map((item) => {
      const product = item.product || {};
      const unitPrice =
        item.price != null ? item.price : calculateItemPrice(item, spots);
      const totalPrice = unitPrice * (item.quantity ?? 1);

      return `
        <tr>
          <td class="text-left">${
            product.product_name || "Bullion Product"
          }</td>
          <td>${item.quantity}</td>
          <td>${product.content.toFixed(3)} t oz</td>
          <td>${(item.premium * 100).toFixed(1)}% of spot</td>
          <td class="text-right">${
            totalPrice ? formatCurrency(totalPrice) : "-"
          }</td>
        </tr>`;
    })
    .join("");

  return { rowsHtml, bullionOrderItems };
}

export async function generatePackingList({
  purchaseOrder,
  spotPrices = [],
  packageDetails,
}) {
  const payoutFee = purchaseOrder.payout.cost;

  const total =
    purchaseOrder.order_items.reduce((acc, item) => {
      if (item.item_type === "product") {
        const product = item.product;
        const spot = spotPrices.find((s) => s.type === product?.metal_type);

        const price =
          item.price ??
          getItemPrice(
            product.content,
            item.premium ?? item.product.bid_premium,
            spot?.bid_spot
          );
        const quantity = item.quantity ?? 1;

        return acc + price * quantity;
      }

      if (item.item_type === "scrap") {
        const scrap = item.scrap;
        const spot = spotPrices.find((s) => s.type === scrap?.metal);

        const price =
          item.price ??
          getItemPrice(
            scrap.content,
            item.premium ?? item.scrap.bid_premium,
            spot?.bid_spot
          );

        return acc + price;
      }

      return acc;
    }, 0) -
    (purchaseOrder.shipment?.shipping_charge ?? 0) -
    payoutFee;

  const scrapRows = buildPackingScrapRows(
    purchaseOrder.order_items,
    spotPrices
  );
  const bullionRows = buildPackingBullionRows(
    purchaseOrder.order_items,
    spotPrices
  );

  const selectedPackage = packageDetails?.label || "Unknown Package";
  const dimensions = packageDetails?.dimensions || {
    length: "-",
    width: "-",
    height: "-",
    units: "IN",
  };

  const isCarrierPickup =
    purchaseOrder.shipment?.pickup_type !== "Store Dropoff" &&
    purchaseOrder.carrier_pickup !== null;

  const svgBox = generateBoxSVG(
    dimensions.length,
    dimensions.width,
    dimensions.height,
    selectedPackage
  );

  const pickupInstruction = isCarrierPickup
    ? `
      <h3>3) Wait for pickup.</h3>
      <p>
        We've scheduled a FedEx pickup on your behalf. Please ensure your package is ready by
        <strong>${new Date(
          purchaseOrder.carrier_pickup?.pickup_requested_at
        ).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
        })}</strong>.
        You do not need to drop off the package yourself. We’ll update you via email and your dashboard
        once it’s picked up and scanned by the carrier.
      </p>
      `
    : `
      <h3>3) Drop off your package.</h3>
      <p>
        Take your package to a FedEx or affiliate location of your choosing.
        If you would like to change to a carrier pickup, please give us a call and we’ll get you scheduled.
      </p>
    `;

  const shippingSection = renderPackingShippingSection(purchaseOrder, {
    isReturn: false,
    includePayoutFee: false,
  });

  const bullionTable = bullionRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Bullion Products</th>
              <th>Metal</th>
              <th>Quantity</th>
              <th>Content</th>
              <th>Bullion Estimate</th>
            </tr>
          </thead>
          <tbody>
            ${bullionRows}
          </tbody>
        </table>
      </div>
      `
    : "";

  const scrapTable = scrapRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Scrap Line Items</th>
              <th>Pre-Melt</th>
              <th>Purity</th>
              <th>Content</th>
              <th>Scrap Estimate</th>
            </tr>
          </thead>
          <tbody>
            ${scrapRows}
          </tbody>
        </table>
      </div>
      `
    : "";

  const instructionsPage = `
    <div style="page-break-before: always; font-family: 'Poppins', Arial, sans-serif; padding: 20px; font-size: 12px;">
      <div class="packing-title">Shipping Instructions</div>
      <div class="packing-subtitle">Please be sure to read and follow instructions carefully to prevent any issues with your shipment!</div>

      <div class="step">
        <h3>1) Print packing list and label.</h3>
        <p>
          Please print out your packing list and include it inside your package.
          You will also need to print off the label we have generated on your behalf and
          attach it to the outside of your package. If you choose to use your own label,
          please send your items (with the packing list inside) to the following address: ${
            process.env.FEDEX_DORADO_NAME
          } ${process.env.FEDEX_RETURN_ADDRESS_LINE_1} ${
    process.env.FEDEX_RETURN_ADDRESS_LINE_2 || ""
  } ${process.env.FEDEX_RETURN_CITY}, ${process.env.FEDEX_RETURN_STATE} ${
    process.env.FEDEX_RETURN_ZIP
  }.
        </p>
      </div>

      <div class="step">
        <h3>2) Pack your items.</h3>
        <p>
          Pack your items in a medium box. Make sure to take pictures of your items in case of insurance claims prior to packing. Dimensions shown below. Any fees incurred from incorrect package sizing
          will be deducted from your payout. If you believe your items value to be greater than $5,000, you must double box your items. Furthermore, the packaging should not allow your items to be displayed or seen. Do not disclose the contents of your shipment to any other party, including shipping carrier employees. If you need to change your package size or need more than one package,
          please call us. If you have changed your mind on including an item, or forgot to add one earlier — no worries.
          Simply include or omit it from your shipment, and we’ll update your order accordingly once we receive it.
        </p>
        <div class="package-area">
          <div class="package-details">
            <div class="package-details-title">${
              packageDetails?.label || selectedPackage
            }</div>
            <div>Length: ${dimensions.length} in</div>
            <div>Width: ${dimensions.width} in</div>
            <div>Height: ${dimensions.height} in</div>
          </div>
          ${svgBox}
        </div>
      </div>

      <div class="step">
        ${pickupInstruction}
      </div>

      <div class="step">
        <h3>4) Done!</h3>
        <p>
          We’ll take care of the rest. You will receive an email as soon as we get your shipment.
          Furthermore, once your label is scanned by FedEx, we’ll begin providing status updates
          of your shipment on the order screen. You can optionally obtain a printed receipt with the tracking number attached, this will help with any nessecary insurance claims.
        </p>
      </div>
    </div>
  `;

  const labelPage = `
    <div style="page-break-before: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
      <img
        src="data:image/png;base64,${
          purchaseOrder.shipment?.shipping_label || ""
        }"
        alt="Shipping Label"
        style="width: 288pt; height: 432pt;"
      />
    </div>
  `;

  const mainPageBody = `
    ${shippingSection}
    ${renderOrderSummaryTable(purchaseOrder, formatCurrency(total))}
    ${bullionTable}
    ${scrapTable}
    ${instructionsPage}
    ${labelPage}
  `;

  const htmlContent = renderShell({
    title: "Packing List",
    subtitle: "Make sure to place this packing list in your package!",
    bodyHtml: mainPageBody,
  });

  return renderPdf(htmlContent);
}

/* ------------------------------------------------------------------ */
/* generateReturnPackingList (reuses same helpers)                    */
/* ------------------------------------------------------------------ */

export async function generateReturnPackingList({
  purchaseOrder,
  spotPrices = [],
}) {
  const total =
    purchaseOrder.shipment.shipping_charge +
    purchaseOrder.return_shipment.shipping_charge;

  const scrapRows = buildPackingScrapRows(
    purchaseOrder.order_items,
    spotPrices
  );
  const bullionRows = buildPackingBullionRows(
    purchaseOrder.order_items,
    spotPrices
  );

  const shippingSection = renderPackingShippingSection(purchaseOrder, {
    isReturn: true,
  });

  const bullionTable = bullionRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Bullion Products</th>
              <th>Metal</th>
              <th>Quantity</th>
              <th>Content</th>
              <th>Bullion Estimate</th>
            </tr>
          </thead>
          <tbody>${bullionRows}</tbody>
        </table>
      </div>`
    : "";

  const scrapTable = scrapRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Scrap Line Items</th>
              <th>Pre-Melt</th>
              <th>Purity</th>
              <th>Content</th>
              <th>Scrap Estimate</th>
            </tr>
          </thead>
          <tbody>${scrapRows}</tbody>
        </table>
      </div>`
    : "";

  const labelPage = `
    <div style="page-break-before: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
      <img
        src="data:image/png;base64,${
          purchaseOrder.return_shipment?.shipping_label || ""
        }"
        alt="Shipping Label"
        style="width: 288pt; height: 432pt;"
      />
    </div>
  `;

  const bodyHtml = `
    ${shippingSection}
    ${renderOrderSummaryTable(purchaseOrder, "-" + formatCurrency(total))}
    ${bullionTable}
    ${scrapTable}
    ${labelPage}
  `;

  const htmlContent = renderShell({
    title: "Return Packing List",
    subtitle: "This packing list is for Dorado Metals use only.",
    bodyHtml,
  });

  return renderPdf(htmlContent);
}

export async function generateInvoice({
  purchaseOrder,
  spotPrices = [],
  orderSpots = [],
}) {
  const doneStatus = ["Accepted", "Payment Processing", "Completed"];
  const statusForDone =
    purchaseOrder.purchase_order_status ?? purchaseOrder.status ?? "";
  const isDone = doneStatus.includes(statusForDone);

  const browserSpots = purchaseOrder.spots_locked ? orderSpots : spotPrices;
  const total = calculateTotalPrice(purchaseOrder, browserSpots);
  const payoutCost = purchaseOrder.payout.cost ?? 0;

  const { rowsHtml: scrapRows, rawScrapItems } = buildInvoiceScrapRows(
    purchaseOrder.order_items,
    browserSpots
  );
  const scrapTotal = getScrapTotal(rawScrapItems, browserSpots);

  const { rowsHtml: bullionRows, bullionOrderItems } = buildInvoiceBullionRows(
    purchaseOrder.order_items,
    browserSpots
  );
  const bullionTotal = getBullionTotal(bullionOrderItems, browserSpots);

  const lineLabel = isDone ? "Payout" : "Estimate";

  const scrapTable = scrapRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="text-left">Line Items</th>
              <th>Pre-Melt</th>
              <th>Post-Melt</th>
              <th>Purity</th>
              <th>Content</th>
              <th>Premium</th>
              <th class="text-right">${lineLabel}</th>
            </tr>
          </thead>
          <tbody>${scrapRows}</tbody>
        </table>
      </div>`
    : "";

  const bullionTable = bullionRows
    ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="text-left">Bullion Products</th>
              <th>Quantity</th>
              <th>Content</th>
              <th>Premium</th>
              <th class="text-right">${lineLabel}</th>
            </tr>
          </thead>
          <tbody>${bullionRows}</tbody>
        </table>
      </div>`
    : "";

  const shippingTotal =
    (purchaseOrder.shipment?.shipping_charge ?? 0) +
    (purchaseOrder.return_shipment?.shipping_charge ?? 0);

  const totalsSection = `
    <div class="order-info">
      <table>
        <thead>
          <tr>
            <th class="text-left">Name</th>
            <th>Type</th>
            <th class="text-right">${lineLabel}</th>
          </tr>
        </thead>
        <tbody>
          ${
            scrapRows
              ? `
          <tr>
            <td class="text-left">Scrap Total</td>
            <td>Addition</td>
            <td class="text-right">${formatCurrency(scrapTotal)}</td>
          </tr>`
              : ""
          }
          ${
            bullionRows
              ? `
          <tr>
            <td class="text-left">Bullion Total</td>
            <td>Addition</td>
            <td class="text-right">${formatCurrency(bullionTotal)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="text-left">Shipping Fees</td>
            <td>Deduction</td>
            <td class="text-right">-${formatCurrency(shippingTotal)}</td>
          </tr>
          <tr>
            <td class="text-left">Payout Fees</td>
            <td>Deduction</td>
            <td class="text-right">-${formatCurrency(payoutCost)}</td>
          </tr>
          <tr>
            <td class="text-left text-bold">Total:</td>
            <td></td>
            <td class="text-right text-bold">${formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const headerHtml = renderInvoiceHeader(purchaseOrder, total, browserSpots);
  const shippingAndPayoutHtml = renderInvoiceShippingAndPayout(purchaseOrder, {
    payoutCost,
  });

  const bodyHtml = `
    ${headerHtml}
    ${shippingAndPayoutHtml}
    ${bullionTable}
    ${scrapTable}
    ${totalsSection}
  `;

  const title = isDone ? "Purchase Order Invoice" : "Purchase Order Preview";
  const subtitle = isDone
    ? "You have accepted our offer. View your final price breakdown below."
    : "Please note: until our offer has been accepted, prices seen here may not be representative of the final amounts and do not represent an obligation to purchase your items at these amounts.";

  const htmlContent = renderShell({
    title,
    subtitle,
    bodyHtml,
  });

  return renderPdf(htmlContent);
}

export async function generateSalesOrderInvoice({ salesOrder, spots = [] }) {
  const doneStatus = ["Preparing", "In Transit", "Completed"];

  const bullionItems = salesOrder.order_items
    .filter((item) => item.product)
    .map((item) => {
      const product = item.product || {};
      return `
        <tr>
          <td class="text-left">${
            product.product_name || "Bullion Product"
          }</td>
          <td>${item.quantity}</td>
          <td>${product.content.toFixed(3)} t oz</td>
          <td class="text-right">
            ${(item.price * item.quantity).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </td>
        </tr>
      `;
    })
    .join("");

  const title = doneStatus.includes(salesOrder.sales_order_status)
    ? "Sales Order Invoice"
    : "Sales Order Preview";

  const subtitle = "Items and price details contained below.";

  const bodyHtml = `
    <div class="shipping-info">

      <div class="details">
        <h3>Order</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Number:</span>
            <span class="detail-value">SO-${salesOrder.order_number
              .toString()
              .padStart(6, "0")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Name:</span>
            <span class="detail-value">${
              salesOrder.user?.user_name ?? ""
            }</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Placed:</span>
            <span class="detail-value">${new Date(
              salesOrder.created_at
            ).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${salesOrder.sales_order_status}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Items:</span>
            <span class="detail-value">${salesOrder.order_items.length}</span>
          </div>
        </div>
      </div>

      <div class="details">
        <h3>Shipping To</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Street 1:</span>
            <span class="detail-value">${salesOrder.address.line_1}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Street 2:</span>
            <span class="detail-value">${salesOrder.address.line_2}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">City:</span>
            <span class="detail-value">${salesOrder.address.city}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">State:</span>
            <span class="detail-value">${salesOrder.address.state}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Zip Code:</span>
            <span class="detail-value">${salesOrder.address.zip}</span>
          </div>
        </div>
      </div>

      <div class="details">
        <h3>Spots</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Gold:</span>
            <span class="detail-value">${spots
              .find((s) => s.type === "Gold")
              .ask_spot.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Silver:</span>
            <span class="detail-value">${spots
              .find((s) => s.type === "Silver")
              .ask_spot.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Platinum:</span>
            <span class="detail-value">${spots
              .find((s) => s.type === "Platinum")
              .ask_spot.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Palladium:</span>
            <span class="detail-value">${spots
              .find((s) => s.type === "Palladium")
              .ask_spot.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}</span>
          </div>
        </div>
      </div>
    </div>

    ${
      bullionItems
        ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="text-left">Order Items</th>
              <th>Quantity</th>
              <th>Content</th>
              <th class="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            ${bullionItems}
          </tbody>
        </table>
      </div>
      `
        : ""
    }

    <div class="order-info">
      <table>
        <thead>
          <tr>
            <th class="text-left">Charges</th>
            <th class="text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${
            bullionItems
              ? `
          <tr>
            <td class="text-left">Item Total</td>
            <td class="text-right">${salesOrder.item_total.toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}</td>
          </tr>
          `
              : ""
          }

          <tr>
            <td class="text-left">Shipping Fee</td>
            <td class="text-right">${salesOrder.shipping_cost.toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}</td>
          </tr>

          ${
            salesOrder.used_funds
              ? `
          <tr>
            <td class="text-left">Credit Applied</td>
            <td class="text-right">-${salesOrder.pre_charges_amount.toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}</td>
          </tr>
          `
              : ""
          }

          ${
            salesOrder.charges_amount > 0
              ? `
          <tr>
            <td class="text-left">Payment Fee</td>
            <td class="text-right">${salesOrder.charges_amount.toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}</td>
          </tr>
          `
              : ""
          }

          <tr>
            <td class="text-left text-bold">Total: </td>
            <td class="text-right text-bold">${salesOrder.order_total.toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const htmlContent = renderShell({
    title,
    subtitle,
    bodyHtml,
  });

  return renderPdf(htmlContent);
}
