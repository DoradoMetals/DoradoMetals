import { generateBoxSVG } from "#domain/media/pdfs/utils/generateBoxSVG.ts";
import {
  bullionLines,
  calculateTotalPrice,
  effectivePayoutFee,
  inboundShipment,
  itemsTotal,
  recordedContent,
  scrapLines,
  type Bids,
} from "#domain/pricing/service.ts";

import { renderPdf } from "#providers/pdfs/puppeteer.ts";
import { renderShell } from "#domain/media/pdfs/render/layout.ts";
import { formatCurrency } from "#domain/media/pdfs/render/format.ts";
import {
  renderInvoiceHeader,
  renderInvoiceShippingAndPayout,
  renderPackingShippingSection,
  renderOrderSummaryTable,
  returnShipment,
  buildPackingScrapRows,
  buildPackingBullionRows,
  buildInvoiceScrapRows,
  buildInvoiceBullionRows,
} from "#domain/media/pdfs/render/sections.ts";
import type { DocumentLabels, PackageDetails } from "#domain/media/pdfs/render/sections.ts";
import type { OrderView } from "@dorado/contracts";

export type { DocumentLabels, PackageDetails } from "#domain/media/pdfs/render/sections.ts";

// THE INPUTS EACH DOCUMENT TAKES, and they are ids resolved to rows rather than
// a body the browser sent (ruling 10).
//
// A purchase document prices the metal, so it needs the BIDS the order is
// valued at; a sales-order invoice quotes the ASKS the customer was charged.
// Both need the labels behind the ids the rows carry. Nothing here is a
// composed order any more - `order` is the OrderView, straight from
// domain/orders/read.ts.
export type PurchaseDocument = {
  order: OrderView;
  bids: Bids;
  labels: DocumentLabels;
  /** The box the parcel was booked with - only the packing list draws it. */
  package?: PackageDetails | null;
};

export type SalesDocument = {
  order: OrderView;
  /** metal_id -> the ask the order was priced at. */
  asks: ReadonlyMap<string, number | null>;
  labels: DocumentLabels;
};

export function buildPackingListHtml({
  order,
  bids,
  labels,
  package: box = null,
}: PurchaseDocument): string {
  // The same sum the invoice uses, rather than a second copy of it.
  //
  // This had its own inline reduce, and the two drifted: it fell back to the
  // scrap row's own premium where calculateTotalPrice did not, so purchase
  // order 239 came out at $7,980.22 here and $4,744.11 on the invoice - both
  // documents going to the same customer.
  const total = calculateTotalPrice(order, bids);

  const scrapRows = buildPackingScrapRows(scrapLines(order.items), bids, labels);
  const bullionRows = buildPackingBullionRows(bullionLines(order.items), bids, labels);

  const shipment = inboundShipment(order);
  const packageLabel =
    box?.label ??
    (shipment?.package_id ? (labels.packages.get(shipment.package_id) ?? null) : null);
  const selectedPackage = packageLabel || "Unknown Package";

  // The fallback below is display text - "Length: - in" reads correctly on the
  // page. The box is geometry, and `"-" * scale` is NaN, so passing the same
  // fallback into generateBoxSVG produced an SVG whose width, height, viewBox
  // and every polygon were the string NaN: 68 of them, on the packing list a
  // customer receives, whenever a request arrived without a package. Found by
  // giving generateBoxSVG a type.
  const boxDimensions = [box?.length, box?.width, box?.height].map(Number);
  const svgBox = boxDimensions.every(Number.isFinite)
    ? generateBoxSVG(boxDimensions[0], boxDimensions[1], boxDimensions[2], selectedPackage)
    : "";

  const dimension = (value: number | null | undefined): string =>
    value == null ? "-" : String(value);

  const isCarrierPickup =
    shipment?.pickup_type !== "Store Dropoff" && order.pickup !== null;

  const pickupInstruction = isCarrierPickup
    ? `
      <h3>3) Wait for pickup.</h3>
      <p>
        We've scheduled a FedEx pickup on your behalf. Please ensure your package is ready by
        <strong>${new Date(
          order.pickup?.requested_at ?? Date.now()
        ).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
        })}</strong>.
        You do not need to drop off the package yourself. We'll update you via email and your dashboard
        once it's picked up and scanned by the carrier.
      </p>
      `
    : `
      <h3>3) Drop off your package.</h3>
      <p>
        Take your package to a FedEx or affiliate location of your choosing.
        If you would like to change to a carrier pickup, please give us a call and we'll get you scheduled.
      </p>
    `;

  const shippingSection = renderPackingShippingSection(order, {
    isReturn: false,
    includePayoutFee: false,
    labels,
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
          Simply include or omit it from your shipment, and we'll update your order accordingly once we receive it.
        </p>
        <div class="package-area">
          <div class="package-details">
            <div class="package-details-title">${selectedPackage}</div>
            <div>Length: ${dimension(box?.length)} in</div>
            <div>Width: ${dimension(box?.width)} in</div>
            <div>Height: ${dimension(box?.height)} in</div>
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
          We'll take care of the rest. You will receive an email as soon as we get your shipment.
          Furthermore, once your label is scanned by FedEx, we'll begin providing status updates
          of your shipment on the order screen. You can optionally obtain a printed receipt with the tracking number attached, this will help with any nessecary insurance claims.
        </p>
      </div>
    </div>
  `;

  const labelPage = `
    <div style="page-break-before: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
      <img
        src="data:image/png;base64,${shipment?.label ?? ""}"
        alt="Shipping Label"
        style="width: 288pt; height: 432pt;"
      />
    </div>
  `;

  const mainPageBody = `
    ${shippingSection}
    ${renderOrderSummaryTable(order, formatCurrency(total))}
    ${bullionTable}
    ${scrapTable}
    ${instructionsPage}
    ${labelPage}
  `;

  return renderShell({
    title: "Packing List",
    subtitle: "Make sure to place this packing list in your package!",
    bodyHtml: mainPageBody,
  });
}

/* ------------------------------------------------------------------ */
/* the return leg (reuses the same helpers)                            */
/* ------------------------------------------------------------------ */

export function buildReturnPackingListHtml({
  order,
  bids,
  labels,
}: PurchaseDocument): string {
  // GUARDED DEFENSIVELY. A return packing list is only produced for an order
  // that has both legs, so in practice both shipments are present - but this
  // summed them unguarded, and `undefined + undefined` is NaN, which would
  // print "NaN" on a document going into a parcel.
  const outbound = returnShipment(order);
  const total = (inboundShipment(order)?.cost ?? 0) + (outbound?.cost ?? 0);

  const scrapRows = buildPackingScrapRows(scrapLines(order.items), bids, labels);
  const bullionRows = buildPackingBullionRows(bullionLines(order.items), bids, labels);

  const shippingSection = renderPackingShippingSection(order, {
    isReturn: true,
    labels,
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
        src="data:image/png;base64,${outbound?.label ?? ""}"
        alt="Shipping Label"
        style="width: 288pt; height: 432pt;"
      />
    </div>
  `;

  const bodyHtml = `
    ${shippingSection}
    ${renderOrderSummaryTable(order, "-" + formatCurrency(total))}
    ${bullionTable}
    ${scrapTable}
    ${labelPage}
  `;

  return renderShell({
    title: "Return Packing List",
    subtitle: "This packing list is for Dorado Metals use only.",
    bodyHtml,
  });
}

export function buildInvoiceHtml({ order, bids, labels }: PurchaseDocument): string {
  // 'Accepted' left the status lifecycle (migration 092 remapped its rows to
  // 'Payment Processing'), so the done set no longer names it.
  const doneStatus = ["Payment Processing", "Completed"];
  const isDone = doneStatus.includes(order.order.status ?? "");

  const total = calculateTotalPrice(order, bids);
  const payoutCost = effectivePayoutFee(order);

  const scrap = scrapLines(order.items);
  const bullion = bullionLines(order.items);
  const scrapRows = buildInvoiceScrapRows(scrap, bids, labels);
  const bullionRows = buildInvoiceBullionRows(bullion, bids);
  const scrapTotal = itemsTotal(scrap, bids);
  const bullionTotal = itemsTotal(bullion, bids);

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
    (inboundShipment(order)?.cost ?? 0) + (returnShipment(order)?.cost ?? 0);

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

  const bodyHtml = `
    ${renderInvoiceHeader(order, total, bids, labels)}
    ${renderInvoiceShippingAndPayout(order, { payoutCost, labels })}
    ${bullionTable}
    ${scrapTable}
    ${totalsSection}
  `;

  const title = isDone ? "Purchase Order Invoice" : "Purchase Order Preview";
  const subtitle = isDone
    ? "Your order's pricing has been finalized. View your final price breakdown below."
    : "Please note: until your order's pricing has been finalized, prices seen here may not be representative of the final amounts and do not represent an obligation to purchase your items at these amounts.";

  return renderShell({ title, subtitle, bodyHtml });
}

// A metal with no ask renders as a dash. The asks used to arrive in a request
// body, so a missing one was a request away and `spots.find(...).ask.toFixed()`
// threw - on the invoice attached to the refiner's copy of a sales order,
// built AFTER the transaction that marks the order sent, so the throw was
// silent. Render what is known and a dash for what is not.
const money = (value: number | null | undefined): string =>
  value == null
    ? "&mdash;"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function buildSalesOrderInvoiceHtml({
  order,
  asks,
  labels,
}: SalesDocument): string {
  const doneStatus = ["Preparing", "In Transit", "Completed"];

  const bullionItems = bullionLines(order.items)
    .map(
      (line) => `
        <tr>
          <td class="text-left">${line.product?.name || "Bullion Product"}</td>
          <td>${line.quantity}</td>
          <td>${
            recordedContent(line) != null
              ? `${recordedContent(line)!.toFixed(3)} t oz`
              : "&mdash;"
          }</td>
          <td class="text-right">
            ${money((line.price ?? 0) * (line.quantity ?? 0))}
          </td>
        </tr>
      `
    )
    .join("");

  const spotRows = [...labels.metals]
    .map(
      ([metal_id, name]) => `
          <div class="detail-row">
            <span class="detail-label">${name}:</span>
            <span class="detail-value">${money(asks.get(metal_id))}</span>
          </div>`
    )
    .join("");

  const title = doneStatus.includes(order.order.status ?? "")
    ? "Sales Order Invoice"
    : "Sales Order Preview";

  const bodyHtml = `
    <div class="shipping-info">

      <div class="details">
        <h3>Order</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Number:</span>
            <span class="detail-value">SO-${String(order.order.number ?? "").padStart(6, "0")}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Name:</span>
            <span class="detail-value">${order.user?.name ?? ""}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Placed:</span>
            <span class="detail-value">${new Date(
              order.order.created_at ?? Date.now()
            ).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${order.order.status}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Items:</span>
            <span class="detail-value">${order.items.length}</span>
          </div>
        </div>
      </div>

      <div class="details">
        <h3>Shipping To</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Street 1:</span>
            <span class="detail-value">${order.address?.line_1 ?? ""}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Street 2:</span>
            <span class="detail-value">${order.address?.line_2 ?? ""}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">City:</span>
            <span class="detail-value">${order.address?.city ?? ""}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">State:</span>
            <span class="detail-value">${order.address?.state ?? ""}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Zip Code:</span>
            <span class="detail-value">${order.address?.zip ?? ""}</span>
          </div>
        </div>
      </div>

      <div class="details">
        <h3>Spots</h3>
        <div class="detail-content">
          ${spotRows}
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
            <td class="text-right">${money(order.totals?.items ?? 0)}</td>
          </tr>
          `
              : ""
          }

          <tr>
            <td class="text-left">Shipping Fee</td>
            <td class="text-right">${money(order.totals?.shipping ?? 0)}</td>
          </tr>

          ${
            order.totals?.used_funds
              ? `
          <tr>
            <td class="text-left">Credit Applied</td>
            <td class="text-right">-${money(order.totals?.funds ?? 0)}</td>
          </tr>
          `
              : ""
          }

          ${
            (order.totals?.surcharge ?? 0) > 0
              ? `
          <tr>
            <td class="text-left">Payment Fee</td>
            <td class="text-right">${money(order.totals?.surcharge ?? 0)}</td>
          </tr>
          `
              : ""
          }

          <tr>
            <td class="text-left text-bold">Total: </td>
            <td class="text-right text-bold">${money(order.totals?.total ?? 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return renderShell({
    title,
    subtitle: "Items and price details contained below.",
    bodyHtml,
  });
}

// Building the document and printing it are separate.
//
// Each generator used to end in `return renderPdf(htmlContent)`, so the only
// way to exercise 746 lines of layout was to start Chromium and get back a
// PDF - which meant checking that a document came out, never what was in it.
// Rendering every order in dev took 65 seconds; building the same HTML takes
// milliseconds, and the HTML is where all of the logic actually is.

export async function generatePackingList(input: PurchaseDocument): Promise<Uint8Array> {
  return renderPdf(buildPackingListHtml(input));
}

export async function generateReturnPackingList(
  input: PurchaseDocument
): Promise<Uint8Array> {
  return renderPdf(buildReturnPackingListHtml(input));
}

export async function generateInvoice(input: PurchaseDocument): Promise<Uint8Array> {
  return renderPdf(buildInvoiceHtml(input));
}

export async function generateSalesOrderInvoice(
  input: SalesDocument
): Promise<Uint8Array> {
  return renderPdf(buildSalesOrderInvoiceHtml(input));
}
