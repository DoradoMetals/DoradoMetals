import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";
import {
  inboundShipment, recordedContent, unitPrice, type Bids,
} from "#domain/pricing/service.ts";
import {
  formatCurrency,
  getPayoutDelay,
} from "#domain/media/pdfs/render/format.ts";
import type { OrderView, OrderViewItem } from "@dorado/contracts";

export type DocumentLabels = {
  metals: ReadonlyMap<string, string>;
  services: ReadonlyMap<string, string>;
  packages: ReadonlyMap<string, string>;
};

export type PackageDetails = {
  label: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
};

const serviceOf = (
  shipment: OrderView["shipments"][number] | null, labels: DocumentLabels
): string =>
  (shipment?.carrier_service_id ? labels.services.get(shipment.carrier_service_id) : null) || "-";

const packageOf = (
  shipment: OrderView["shipments"][number] | null, labels: DocumentLabels
): string =>
  (shipment?.package_id ? labels.packages.get(shipment.package_id) : null) || "-";

const METAL_ORDER = ["Gold", "Silver", "Platinum", "Palladium"];

const rank = (name: string): number => {
  const at = METAL_ORDER.indexOf(name);
  return at === -1 ? METAL_ORDER.length : at;
};

export function scrapItemNames(
  lines: OrderViewItem[], metals: ReadonlyMap<string, string>
): Map<string, string> {
  const ordered = lines
    .filter((line) => metals.has(line.metal_id))
    .sort((a, b) => rank(metals.get(a.metal_id)!) - rank(metals.get(b.metal_id)!));

  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const line of ordered) {
    const metal = metals.get(line.metal_id)!;
    const nth = (seen.get(metal) ?? 0) + 1;
    seen.set(metal, nth);
    names.set(line.id, `${metal} Item ${nth}`);
  }
  return names;
}

export function returnShipment(order: OrderView): OrderView["shipments"][number] | null {
  return order.shipments.find((s) => s.direction === "Return") ?? null;
}

const pct = (value: number | null | undefined): string =>
  value == null ? "&mdash;" : `${(value * 100).toFixed(1)}%`;

const oz = (value: number | null | undefined): string =>
  value == null ? "&mdash;" : value.toFixed(3);

export function renderInvoiceHeader(
  order: OrderView,
  total: number,
  bids: Bids,
  labels: DocumentLabels
): string {
  const orderPlaced = order.order.created_at
    ? new Date(order.order.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "&mdash;";

  const orderNumber = `PO-${String(order.order.number ?? "").padStart(6, "0")}`;
  const status = order.order.status ?? "";
  const userName = order.user?.name ?? "";

  const doneStatus = ["Payment Processing", "Completed"];
  const isDone = doneStatus.includes(status);
  const totalLabel = isDone ? "Total Payout" : "Total Estimate";

  const spotRows =
    [...labels.metals]
      .sort(([, a], [, b]) => rank(a) - rank(b))
      .flatMap(([metal_id, name]) => {
        const bid = bids.get(metal_id);
        if (bid == null) return [];
        return [`
          <div class="invoice-card-row">
            <span>${name}:</span>
            <span>${formatCurrency(bid)}</span>
          </div>
        `];
      })
      .join("") ||
    `<div class="invoice-card-row"><span>Spots unavailable</span></div>`;

  const spotsStatus = order.order.spots_locked ? "Locked" : "Unlocked";

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
            <span>${order.items.length}</span>
          </div>
        </div>
      </div>

      <div class="invoice-card">
        <div class="invoice-card-title">Pricing</div>
        <div class="invoice-card-body">
          <div class="invoice-card-row">
            <span>${totalLabel}:</span>
            <span>${formatCurrency(total)}</span>
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

export function renderInvoiceShippingAndPayout(
  order: OrderView, payoutCost: number, labels: DocumentLabels
): string {
  const inbound = inboundShipment(order);
  const outbound = returnShipment(order);
  const isCancelled = order.order.status === "Cancelled";

  const leg = (
    label: string, shipment: OrderView["shipments"][number]
  ): string => `
      <tr>
        <td class="text-left">${label}</td>
        <td>${serviceOf(shipment, labels)}</td>
        <td>${shipment.insured ? "Yes" : "No"}</td>
        <td>${packageOf(shipment, labels)}</td>
        <td class="text-right">${formatCurrency(shipment.cost ?? 0)}</td>
      </tr>`;

  const inboundRow = inbound ? leg("Inbound", inbound) : "";
  const outboundRow = isCancelled && outbound ? leg("Return", outbound) : "";

  const payoutMethod = order.payout?.method ?? "-";
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
            <td class="text-right">${formatCurrency(payoutCost)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function renderPackingShippingSection(
  order: OrderView,
  labels: DocumentLabels,
  isReturn: boolean,
  includePayoutFee: boolean,
  payoutFee: number
): string {
  const customer = {
    name: order.user?.name ?? "",
    line_1: order.address?.line_1 ?? "",
    line_2: order.address?.line_2 ?? "",
    city: order.address?.city ?? "",
    state: order.address?.state ?? "",
    zip: order.address?.zip ?? "",
    phone: order.address?.phone_number ?? "",
  };

  const dorado = {
    name: process.env.FEDEX_DORADO_NAME ?? "",
    line_1: process.env.FEDEX_RETURN_ADDRESS_LINE_1 ?? "",
    line_2: process.env.FEDEX_RETURN_ADDRESS_LINE_2 ?? "",
    city: process.env.FEDEX_RETURN_CITY ?? "",
    state: process.env.FEDEX_RETURN_STATE ?? "",
    zip: process.env.FEDEX_RETURN_ZIP ?? "",
    phone: process.env.FEDEX_DORADO_PHONE_NUMBER ?? "",
  };

  const from = isReturn ? dorado : customer;
  const to = isReturn ? customer : dorado;

  const shipment = isReturn ? returnShipment(order) : inboundShipment(order);
  const pickupType = shipment?.pickup_type || "-";

  return `
    <div class="shipping-info">
      <div class="shipping-box">
        <h3>Shipping From:</h3>
        <div>
          <h4>${from.name}</h4>
          <p>
            ${from.line_1} ${from.line_2}<br/>
            ${from.city}, ${from.state} ${from.zip}
          </p>
          <p>${formatPhoneNumber(from.phone)}</p>
        </div>
      </div>

      <div class="shipping-box">
        <h3>Shipping To:</h3>
        <div>
          <h4>${to.name}</h4>
          <p>
            ${to.line_1} ${to.line_2}<br/>
            ${to.city}, ${to.state} ${to.zip}
          </p>
          <p>${formatPhoneNumber(to.phone)}</p>
        </div>
      </div>

      <div class="details">
        <h3>Shipment Details:</h3>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Tracking Number:</span>
            <span class="detail-value">${shipment?.tracking_number || "-"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Service:</span>
            <span class="detail-value">${serviceOf(shipment, labels)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Package Size:</span>
            <span class="detail-value">${packageOf(shipment, labels)}</span>
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
            <span class="detail-value">${formatCurrency(shipment?.cost)}</span>
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

export function renderOrderSummaryTable(
  order: OrderView,
  totalDisplay: string
): string {
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
            <td>${
              order.order.created_at
                ? new Date(order.order.created_at).toLocaleDateString()
                : "&mdash;"
            }</td>
            <td>PO-${String(order.order.number ?? "").padStart(6, "0")}</td>
            <td>${totalDisplay}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function buildPackingScrapRows(
  lines: OrderViewItem[], bids: Bids, labels: DocumentLabels
): string {
  const names = scrapItemNames(lines, labels.metals);

  return lines
    .map((line) => {
      const price = unitPrice(line, bids);
      return `
        <tr>
          <td>${names.get(line.id) ?? "Scrap Item"}</td>
          <td>${line.pre_melt ?? "-"} ${line.unit ?? ""}</td>
          <td>${pct(line.purity)}</td>
          <td>${oz(line.content)}</td>
          <td>${pct(line.premium)}</td>
          <td>${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildPackingBullionRows(
  lines: OrderViewItem[], bids: Bids, labels: DocumentLabels
): string {
  return lines
    .map((line) => {
      const total = unitPrice(line, bids) * (line.quantity ?? 1);
      return `
        <tr>
          <td>${line.product?.name || "Bullion Product"}</td>
          <td>${labels.metals.get(line.metal_id) ?? "-"}</td>
          <td>${line.quantity}</td>
          <td>${recordedContent(line) ?? "-"}</td>
          <td>${total ? formatCurrency(total) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildInvoiceScrapRows(
  lines: OrderViewItem[], bids: Bids, labels: DocumentLabels
): string {
  const names = scrapItemNames(lines, labels.metals);

  return lines
    .map((line) => {
      const price = unitPrice(line, bids);
      return `
        <tr>
          <td class="text-left">${names.get(line.id) ?? "Scrap Item"}</td>
          <td>${line.pre_melt} ${line.unit ?? ""}</td>
          <td>${line.post_melt ?? line.pre_melt} ${line.unit ?? ""}</td>
          <td>${pct(line.purity)}</td>
          <td>${line.content != null ? `${line.content.toFixed(3)} t oz` : "&mdash;"}</td>
          <td>${pct(line.premium)}</td>
          <td class="text-right">${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildInvoiceBullionRows(lines: OrderViewItem[], bids: Bids): string {
  return lines
    .map((line) => {
      const total = unitPrice(line, bids) * (line.quantity ?? 1);
      return `
        <tr>
          <td class="text-left">${line.product?.name || "Bullion Product"}</td>
          <td>${line.quantity}</td>
          <td>${
            recordedContent(line) != null
              ? `${recordedContent(line)!.toFixed(3)} t oz`
              : "&mdash;"
          }</td>
          <td>${line.premium != null ? `${(line.premium * 100).toFixed(1)}% of spot` : "&mdash;"}</td>
          <td class="text-right">${total ? formatCurrency(total) : "-"}</td>
        </tr>`;
    })
    .join("");
}
