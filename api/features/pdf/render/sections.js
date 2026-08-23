import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.js";
import { assignScrapItemNames } from "#features/scrap/utils/assignScrapNames.js";
import { calculateItemPrice } from "#features/purchase-orders/utils/calculations.js";
import {
  formatCurrency,
  getItemPrice,
  getPayoutDelay,
} from "#features/pdf/render/format.js";

export function renderInvoiceHeader(purchaseOrder, total, spots = []) {
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

export function renderInvoiceShippingAndPayout(purchaseOrder, { payoutCost }) {
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

// An order with no address still has to render.
//
// Every one of these was `purchaseOrder.address.name` and threw on a null
// address, so the packing list was a 500 rather than a document. Five of dev's
// sixteen purchase orders have no address_id - Completed, Accepted and Payment
// Processing, not junk - and production has one.
//
// A blank line on a document is recoverable; a 500 when an admin asks for a
// packing list is not, and it gives no hint of what is wrong.
export function renderPackingShippingSection(
  purchaseOrder,
  { isReturn = false, includePayoutFee = false, payoutFee = 0 } = {}
) {
  const fromIsCustomer = !isReturn;

  const fromName = fromIsCustomer
    ? (purchaseOrder.address?.name ?? "")
    : process.env.FEDEX_DORADO_NAME;

  const fromLine1 = fromIsCustomer
    ? (purchaseOrder.address?.line_1 ?? "")
    : process.env.FEDEX_RETURN_ADDRESS_LINE_1;

  const fromLine2 = fromIsCustomer
    ? purchaseOrder.address?.line_2 || ""
    : process.env.FEDEX_RETURN_ADDRESS_LINE_2 || "";

  const fromCity = fromIsCustomer
    ? (purchaseOrder.address?.city ?? "")
    : process.env.FEDEX_RETURN_CITY;

  const fromState = fromIsCustomer
    ? (purchaseOrder.address?.state ?? "")
    : process.env.FEDEX_RETURN_STATE;

  const fromZip = fromIsCustomer
    ? (purchaseOrder.address?.zip ?? "")
    : process.env.FEDEX_RETURN_ZIP;

  const fromPhone = fromIsCustomer
    ? (purchaseOrder.address?.phone_number ?? "")
    : process.env.FEDEX_DORADO_PHONE_NUMBER;

  const toName = fromIsCustomer
    ? process.env.FEDEX_DORADO_NAME
    : (purchaseOrder.address?.name ?? "");

  const toLine1 = fromIsCustomer
    ? process.env.FEDEX_RETURN_ADDRESS_LINE_1
    : (purchaseOrder.address?.line_1 ?? "");

  const toLine2 = fromIsCustomer
    ? process.env.FEDEX_RETURN_ADDRESS_LINE_2 || ""
    : purchaseOrder.address?.line_2 || "";

  const toCity = fromIsCustomer
    ? process.env.FEDEX_RETURN_CITY
    : (purchaseOrder.address?.city ?? "");

  const toState = fromIsCustomer
    ? process.env.FEDEX_RETURN_STATE
    : (purchaseOrder.address?.state ?? "");

  const toZip = fromIsCustomer
    ? process.env.FEDEX_RETURN_ZIP
    : (purchaseOrder.address?.zip ?? "");

  const toPhone = fromIsCustomer
    ? process.env.FEDEX_DORADO_PHONE_NUMBER
    : (purchaseOrder.address?.phone_number ?? "");

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


export function renderOrderSummaryTable(purchaseOrder, totalDisplay) {
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

export function buildPackingScrapRows(orderItems, spotPrices) {
  const rawScrapItems = orderItems.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);

  return scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spotPrices.find((s) => s.type === scrap.metal);
      const premium = item.premium ?? item.scrap.bid_premium;
      const price =
        item.price != null
          ? item.price
          : getItemPrice(scrap.content, premium, spot?.bid_spot);

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt || "-"} ${scrap.gross_unit || ""}</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)}</td>
          <td>${premium != null ? (premium * 100).toFixed(1) + "%" : "-"}</td>
          <td>${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildPackingBullionRows(orderItems, spotPrices) {
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

export function buildInvoiceScrapRows(orderItems, spots) {
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

export function buildInvoiceBullionRows(orderItems, spots) {
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

