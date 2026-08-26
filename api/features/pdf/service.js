import { generateBoxSVG } from "#features/pdf/utils/generateBoxSVG.ts";
import {
  calculateTotalPrice,
  getBullionTotal,
  getScrapTotal,
} from "#features/purchase-orders/utils/calculations.ts";

import { renderPdf } from "#features/pdf/render/browser.ts";
import { renderShell } from "#features/pdf/render/layout.js";
import { formatCurrency } from "#features/pdf/render/format.ts";
import {
  renderInvoiceHeader,
  renderInvoiceShippingAndPayout,
  renderPackingShippingSection,
  renderOrderSummaryTable,
  buildPackingScrapRows,
  buildPackingBullionRows,
  buildInvoiceScrapRows,
  buildInvoiceBullionRows,
} from "#features/pdf/render/sections.js";

export function buildPackingListHtml({
  purchaseOrder,
  spotPrices = [],
  packageDetails,
}) {
  // The same sum the invoice uses, rather than a second copy of it.
  //
  // This had its own inline reduce, and the two drifted: it fell back to the
  // scrap row's own premium where calculateTotalPrice did not, so purchase
  // order 239 came out at $7,980.22 here and $4,744.11 on the invoice - both
  // documents going to the same customer. The fallback was the correct half;
  // calculations.js now has it, and this calls it.
  const total = calculateTotalPrice(purchaseOrder, spotPrices);

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

  // The fallback above is display text - "Length: - in" reads correctly on the
  // page. The box is geometry, and `"-" * scale` is NaN, so passing the same
  // fallback into generateBoxSVG produced an SVG whose width, height, viewBox
  // and every polygon were the string NaN: 68 of them, on the packing list a
  // customer receives, whenever a request arrived without packageDetails. Found
  // by giving generateBoxSVG a type.
  //
  // Coerced rather than type-checked so that nothing which used to draw a box
  // stops drawing one: `null` and `""` both multiplied to 0 before and still
  // do. Only the NaN case changes, and it changes to no box at all.
  const boxDimensions = [
    dimensions.length,
    dimensions.width,
    dimensions.height,
  ].map(Number);

  const svgBox = boxDimensions.every(Number.isFinite)
    ? generateBoxSVG(
        boxDimensions[0],
        boxDimensions[1],
        boxDimensions[2],
        selectedPackage
      )
    : "";

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
              <th>Rate</th>
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

  return htmlContent;
}

/* ------------------------------------------------------------------ */
/* generateReturnPackingList (reuses same helpers)                    */
/* ------------------------------------------------------------------ */

export function buildReturnPackingListHtml({
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
              <th>Rate</th>
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

  return htmlContent;
}

export function buildInvoiceHtml({
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

  return htmlContent;
}

// The invoice's spot table names its four metals, and `spots` arrives in the
// request body rather than from the database, so a missing one is a request
// away. `spots.find(...).ask_spot.toLocaleString(...)` threw a TypeError on
// each of them - and this invoice is the attachment on the refiner's copy of a
// sales order, built after the transaction that marks the order sent, so the
// throw was silent in exactly the way the packing list's NaN box and the
// supplier email's null address were.
//
// Found by removing the guard in features/sales-orders/service.js to check that
// its test could fail: it failed on this instead.
//
// Same rule as those two: render what is known and a dash for what is not.
const askSpot = (spots, metal) => {
  const value = spots.find((s) => s.type === metal)?.ask_spot;
  return value == null
    ? "&mdash;"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

export function buildSalesOrderInvoiceHtml({ salesOrder, spots = [] }) {
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
            <span class="detail-value">${(salesOrder.address?.line_1 ?? "")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Street 2:</span>
            <span class="detail-value">${(salesOrder.address?.line_2 ?? "")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">City:</span>
            <span class="detail-value">${(salesOrder.address?.city ?? "")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">State:</span>
            <span class="detail-value">${(salesOrder.address?.state ?? "")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Zip Code:</span>
            <span class="detail-value">${(salesOrder.address?.zip ?? "")}</span>
          </div>
        </div>
      </div>

      <div class="details">
        <h3>Spots</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Gold:</span>
            <span class="detail-value">${askSpot(spots, "Gold")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Silver:</span>
            <span class="detail-value">${askSpot(spots, "Silver")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Platinum:</span>
            <span class="detail-value">${askSpot(spots, "Platinum")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Palladium:</span>
            <span class="detail-value">${askSpot(spots, "Palladium")}</span>
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

  return htmlContent;
}


// Building the document and printing it are separate.
//
// Each generator used to end in `return renderPdf(htmlContent)`, so the only
// way to exercise 746 lines of layout was to start Chromium and get back a
// PDF - which meant checking that a document came out, never what was in it.
// Rendering every order in dev took 65 seconds; building the same HTML takes
// milliseconds, and the HTML is where all of the logic actually is.
//
// The generators keep their names and signatures. Nothing that calls them
// changes.

export async function generatePackingList(input) {
  return renderPdf(buildPackingListHtml(input));
}

export async function generateReturnPackingList(input) {
  return renderPdf(buildReturnPackingListHtml(input));
}

export async function generateInvoice(input) {
  return renderPdf(buildInvoiceHtml(input));
}

export async function generateSalesOrderInvoice(input) {
  return renderPdf(buildSalesOrderInvoiceHtml(input));
}
