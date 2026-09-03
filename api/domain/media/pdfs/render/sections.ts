// The HTML sections a rendered document is assembled from.
//
// THE TYPES ARE THE CONTRACT'S NOW (D214 item 12). This file used to declare
// its own `RenderableOrder`, `OrderItem`, `ScrapPart`, `ProductPart`,
// `AddressPart` and `ShipmentPart` - six hand-written shapes describing what
// the COMPOSED order looked like, because no generated row described that tree.
// The composer is gone and `OrderView` is a generated-row shape, so the
// templates read the tables directly:
//
//   item.scrap.pre_melt      ->  item.pre_melt        (the scrap IS the line)
//   item.scrap.gross_unit    ->  item.unit
//   item.scrap.metal         ->  labels.metals.get(item.metal_id)
//   item.product.metal_type  ->  labels.metals.get(item.metal_id)
//   item.item_type           ->  item.bullion_id === null
//   order.shipment           ->  inboundShipment(order)
//   shipment.shipping_charge ->  shipment.cost
//   shipment.shipping_service ->  labels.services.get(s.carrier_service_id)
//   shipment.package         ->  labels.packages.get(s.package_id)
//   order.user.user_name     ->  order.user.name
//   order.carrier_pickup     ->  order.pickup
//
// TWO THINGS THE CALLER SUPPLIES BESIDES THE ORDER, and both are reference
// data rather than order data:
//
//   bids     metal_id -> the price the order is being valued at. The FROZEN
//            spots for a locked order, the live feed otherwise; the caller
//            decides which, because that decision belongs to the document.
//   labels   the names behind the three ids an order's rows carry - the
//            metal, the carrier service and the box.
import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";
import { inboundShipment, unitPrice, type Bids } from "#domain/pricing/service.ts";
import {
  formatCurrency,
  getPayoutDelay,
} from "#domain/media/pdfs/render/format.ts";
import type { OrderView, OrderViewItem } from "@dorado/contracts";

// THE LABELS A DOCUMENT PRINTS FOR THE IDS AN ORDER CARRIES. Three lookups,
// one per reference table, resolved once by the caller: a row names its metal,
// its carrier service and its box by id, and a name is a label rather than a
// column of the order.
export type DocumentLabels = {
  /** metal_id -> the metal's name. */
  metals: ReadonlyMap<string, string>;
  /** carrier_service_id -> the service's name. */
  services: ReadonlyMap<string, string>;
  /** package_id -> the box's label. */
  packages: ReadonlyMap<string, string>;
};

// The box a parcel ships in, as the packing list prints it.
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

// THE DISPLAY ORDER OF THE METALS, which is not alphabetical. Same list
// domain/spots/compose.ts sorts by, for the same reason: a customer reads gold
// first.
const METAL_ORDER = ["Gold", "Silver", "Platinum", "Palladium"];

const rank = (name: string): number => {
  const at = METAL_ORDER.indexOf(name);
  return at === -1 ? METAL_ORDER.length : at;
};

// "Gold Item 1", "Gold Item 2", "Silver Item 1" - the labels a customer reads
// on their packing list and invoice.
//
// A PURE LOOKUP NOW, NOT A MUTATION. It used to walk the composed lines and
// write `item.scrap.name` onto each one, which needed a `name` field on a
// database-derived object that no column supplies. There is no such field on
// an `orders.items` row and there should not be: the label is a document's
// idea, so it is a map the document reads.
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

// The parcel going BACK, when there is one - the leg a cancelled order adds.
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

  // 'Accepted' left the status lifecycle (migration 092); the offer wording
  // died with the offers themselves.
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
  order: OrderView,
  { payoutCost, labels }: { payoutCost: number; labels: DocumentLabels }
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

// An order with no address still has to render.
//
// Every one of these was `purchaseOrder.address.name` and threw on a null
// address, so the packing list was a 500 rather than a document. Five of dev's
// sixteen purchase orders have no address_id - Completed, Accepted and Payment
// Processing, not junk - and production has one.
//
// A blank line on a document is recoverable; a 500 when an admin asks for a
// packing list is not, and it gives no hint of what is wrong.
//
// WHO THE PARCEL IS FOR IS THE CUSTOMER'S NAME. It used to be
// `address.recipient_name`, which the composer read from `exchange.addresses`'
// own `name` column - the last exchange read on a live path. places.addresses,
// which is where the snapshot actually lives, has no such column, so the
// recipient is the order's customer: auth.users' name, which is the same
// person and a row this API owns.
export function renderPackingShippingSection(
  order: OrderView,
  {
    isReturn = false,
    includePayoutFee = false,
    payoutFee = 0,
    labels,
  }: {
    isReturn?: boolean;
    includePayoutFee?: boolean;
    payoutFee?: number;
    labels: DocumentLabels;
  }
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

  // The inbound leg goes customer -> Dorado; the return leg goes back.
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
      // THE LINE'S PREMIUM, NOT THE PRODUCT'S (Jacob, 2026-09-03). A purchase
      // bullion line is priced at the rate band's bullion_pct, written onto
      // the line; falling back to the catalogue's bid_premium printed a rate
      // on a packing list that the rates table never agreed to.
      const total = unitPrice(line, bids) * (line.quantity ?? 1);
      return `
        <tr>
          <td>${line.product?.name || "Bullion Product"}</td>
          <td>${labels.metals.get(line.metal_id) ?? "-"}</td>
          <td>${line.quantity}</td>
          <td>${line.product?.content ?? "-"}</td>
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
            line.product?.content != null
              ? `${line.product.content.toFixed(3)} t oz`
              : "&mdash;"
          }</td>
          <td>${line.premium != null ? `${(line.premium * 100).toFixed(1)}% of spot` : "&mdash;"}</td>
          <td class="text-right">${total ? formatCurrency(total) : "-"}</td>
        </tr>`;
    })
    .join("");
}
