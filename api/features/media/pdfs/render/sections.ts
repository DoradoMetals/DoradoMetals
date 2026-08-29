import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";
import { assignScrapItemNames } from "#features/scrap/utils/assignScrapNames.ts";
import { calculateItemPrice } from "#features/pricing/service.ts";
import {
  formatCurrency,
  getItemPrice,
  getPayoutDelay,
} from "#features/media/pdfs/render/format.ts";

// The HTML sections a rendered document is assembled from.
//
// WHY THESE TYPES ARE LOCAL RATHER THAN FROM @dorado/contracts.
//
// The contracts package has PurchaseOrdersRow, ScrapRow, MetalsRow and the
// rest, and they are the right types for a repo. They are the wrong types
// HERE, for two reasons worth stating so nobody "fixes" this later:
//
//   The shape that arrives is COMPOSED, not a row. A purchase order reaches
//   this file with order_items attached, each item carrying either a nested
//   `scrap` or a nested `product`, plus a shipment and an address. No generated
//   row describes that tree.
//
//   The spots arrive in the CONVERTED wire shape - `name` / `ask` / `bid` -
//   which is what /spots/spot_prices serves and what the order-metals
//   endpoints serve since the orders conversion (D84). The PDF and email
//   paths take them from a request body in that shape.
//
// So these interfaces name exactly the fields the templates read, and nothing
// else. They are deliberately narrow: every property here is one this file
// actually touches, so the type doubles as a list of what a caller must supply.
// Optional and unknown wherever the template already guards - a template that
// prints "-" for a missing value is telling you the field is optional, and a
// type that said otherwise would be a lie that happens to compile.

// The spot part is local like the order shapes: bodies hand this file live
// spot rows and frozen order-spot rows, which share exactly these three
// fields, and calculations.ts reads the same three.
export interface SpotPart {
  name?: string | null;
  ask?: number | null;
  bid?: number | null;
}
/** The scrap half of a line, when item_type is "scrap". */
export interface ScrapPart {
  name?: unknown;
  metal?: unknown;
  content: number;
  purity?: number | null;
  pre_melt?: unknown;
  post_melt?: unknown;
  gross_unit?: unknown;
  bid_premium?: number | null;
}

/** The bullion half of a line, when item_type is "product". */
export interface ProductPart {
  name?: unknown;
  metal_type?: unknown;
  content?: number | null;
  /** Products carry their own premiums; a line falls back to these when it has none. */
  bid_premium?: number | null;
  ask_premium?: number | null;
}

/** One line on an order, which is either scrap or bullion, never both.
 * `product` is nullable on the Next wire; the repos still emit an object of
 * nulls, and every template read already chains. */
export interface OrderItem {
  item_type?: string;
  quantity?: number | null;
  price?: number | null;
  premium?: number | null;
  scrap?: ScrapPart | null;
  product?: ProductPart | null;
}

/** The address snapshot fields printed on a label block (D84):
 * recipient_name is who receives the shipment. */
export interface AddressPart {
  recipient_name?: string | null;
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone_number?: string | null;
  [key: string]: unknown;
}

/** The shipment fields the shipping table prints. */
export interface ShipmentPart {
  insured?: boolean | null;
  package?: string | null;
  shipping_charge?: number | null;
  [key: string]: unknown;
}

/** A purchase order as this file receives it - composed, not a row. */
export interface RenderableOrder {
  /**
   * NOT NULL in both schemas, but the Next contract admits null for the six
   * stray new-schema-only orders, so the templates guard the padStart rather
   * than crash a document for the type's sake. Formatted with padStart, so a
   * string or a number.
   */
  number?: string | number | null;
  /**
   * Nullable in the schema and zero orders have a null one today, so this is
   * typed as it is stored rather than as it happens to be. The template guards
   * it - `new Date(undefined)` renders "Invalid Date" on an invoice, which is
   * the kind of thing that reaches a customer looking deliberate.
   */
  created_at?: string | number | Date | null;
  /** One field for both directions since D84 - direction is the endpoint's. */
  status?: string | null;
  spots_locked?: boolean | null;
  address?: AddressPart | null;
  shipment?: ShipmentPart | null;
  return_shipment?: ShipmentPart | null;
  payout?: { method?: string | null; cost?: number | null } | null;
  carrier_pickup?: { pickup_requested_at?: string | number | Date | null } | null;
  user?: Record<string, unknown> | null;
  order_items?: OrderItem[];
  /** The money, nested under orders.transactions' names (D84). The sales
   * order invoice prints items/shipping/surcharge/funds/total off it. */
  totals?: {
    total?: number | null;
    items?: number | null;
    shipping?: number | null;
    surcharge?: number | null;
    sales_tax?: number | null;
    funds?: number | null;
    refiner_fee?: number | null;
    base_total?: number | null;
    subject_to_charges_amount?: number | null;
    post_charges_amount?: number | null;
  } | null;
  [key: string]: unknown;
}

export function renderInvoiceHeader(
  purchaseOrder: RenderableOrder,
  total: number,
  spots: SpotPart[] = []
): string {
  const orderPlaced = purchaseOrder.created_at
    ? new Date(purchaseOrder.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "&mdash;";

  const orderNumber = `PO-${(purchaseOrder.number ?? "")
    .toString()
    .padStart(6, "0")}`;
  const status = purchaseOrder.status ?? "";
  const userName = purchaseOrder.user?.user_name ?? "";

  // 'Accepted' left the status lifecycle (migration 092); the offer wording
  // died with the offers themselves.
  const doneStatus = ["Payment Processing", "Completed"];
  const isDone = doneStatus.includes(status);
  const totalLabel = isDone ? "Total Payout" : "Total Estimate";


  const metals = ["Gold", "Silver", "Platinum", "Palladium"];
  const spotRows =
    metals
      .map((m) => {
        const spot = spots.find((s) => s.name === m);
        if (!spot?.bid) return null;
        return `
          <div class="invoice-card-row">
            <span>${m}:</span>
            <span>${formatCurrency(spot.bid)}</span>
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
            <span>${purchaseOrder.order_items?.length ?? 0}</span>
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
  purchaseOrder: RenderableOrder,
  { payoutCost }: { payoutCost?: number | null }
): string {
  const inbound = purchaseOrder.shipment;
  const outbound = purchaseOrder.return_shipment;
  const isCancelled = purchaseOrder.status === "Cancelled";

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

  const payoutMethod = purchaseOrder.payout?.method;
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
  purchaseOrder: RenderableOrder,
  {
    isReturn = false,
    includePayoutFee = false,
    payoutFee = 0,
  }: { isReturn?: boolean; includePayoutFee?: boolean; payoutFee?: number } = {}
): string {
  const fromIsCustomer = !isReturn;

  const fromName = fromIsCustomer
    ? (purchaseOrder.address?.recipient_name ?? "")
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
    : (purchaseOrder.address?.recipient_name ?? "");

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


export function renderOrderSummaryTable(
  purchaseOrder: RenderableOrder,
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
              purchaseOrder.created_at
                ? new Date(purchaseOrder.created_at).toLocaleDateString()
                : "&mdash;"
            }</td>
            <td>PO-${(purchaseOrder.number ?? "")
              .toString()
              .padStart(6, "0")}</td>
            <td>${totalDisplay}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function buildPackingScrapRows(orderItems: OrderItem[], spotPrices: SpotPart[]): string {
  const rawScrapItems = orderItems.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  // assignScrapItemNames takes the full contract item. This file only ever
  // holds the composed subset the templates read, and the fields that function
  // uses are all on it - so the narrowing is deliberate rather than a gap.
  // Widening OrderItem to claim id, purchase_order_id and confirmed would be
  // asserting fields these templates never touch.
  const scrapItemsWithNames = assignScrapItemNames(
    rawScrapItems as Parameters<typeof assignScrapItemNames>[0]
  ) as OrderItem[];

  return scrapItemsWithNames
    .map((item) => {
      const scrap: ScrapPart = item.scrap ?? ({} as ScrapPart);
      const spot = spotPrices.find((s) => s.name === scrap.metal);
      const premium = item.premium ?? item.scrap?.bid_premium;
      const price =
        item.price != null
          ? item.price
          : getItemPrice(scrap.content, premium, spot?.bid);

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt || "-"} ${scrap.gross_unit || ""}</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content != null ? scrap.content.toFixed(3) : "&mdash;"}</td>
          <td>${premium != null ? (premium * 100).toFixed(1) + "%" : "-"}</td>
          <td>${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildPackingBullionRows(orderItems: OrderItem[], spotPrices: SpotPart[]): string {
  return orderItems
    .filter((item) => item.item_type === "product" && item.product)
    .map((item) => {
      const product: ProductPart = item.product ?? ({} as ProductPart);
      const spot = spotPrices.find((s) => s.name === product.metal_type);
      const unitPrice =
        item.price != null
          ? item.price
          : getItemPrice(
              product.content,
              item.premium ?? product.bid_premium,
              spot?.bid
            );
      const totalPrice = unitPrice * (item.quantity ?? 1);

      return `
        <tr>
          <td>${product.name || "Bullion Product"}</td>
          <td>${product.metal_type || "-"}</td>
          <td>${item.quantity}</td>
          <td>${product.content || "-"}</td>
          <td>${totalPrice ? formatCurrency(totalPrice) : "-"}</td>
        </tr>`;
    })
    .join("");
}

export function buildInvoiceScrapRows(
  orderItems: OrderItem[],
  spots: SpotPart[]
): { rowsHtml: string; rawScrapItems: OrderItem[] } {
  const rawScrapItems = orderItems.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  // assignScrapItemNames takes the full contract item. This file only ever
  // holds the composed subset the templates read, and the fields that function
  // uses are all on it - so the narrowing is deliberate rather than a gap.
  // Widening OrderItem to claim id, purchase_order_id and confirmed would be
  // asserting fields these templates never touch.
  const scrapItemsWithNames = assignScrapItemNames(
    rawScrapItems as Parameters<typeof assignScrapItemNames>[0]
  ) as OrderItem[];

  const rowsHtml = scrapItemsWithNames
    .map((item) => {
      const scrap: ScrapPart = item.scrap ?? ({} as ScrapPart);

      // THE SAME FALLBACK THE PACKING LIST USES. This row had none, and the two
      // documents disagreed: on order 239 the packing list showed 75.0% and the
      // invoice showed 0.0% for the SAME scrap line, because `item.premium` is
      // null there and `null * 100` is 0 rather than an error.
      // buildPackingScrapRows resolves `item.premium ?? scrap.bid_premium`;
      // this did not.
      //
      // Reproduced by rendering both documents for that order before changing
      // anything, not inferred from reading. CLAUDE.md already records this
      // exact class - an invoice and a packing list disagreeing - and the
      // invoice is the document that tells a customer what they are paid.
      const premium = item.premium ?? scrap.bid_premium;

      const price =
        item.price != null
          ? item.price
          : // calculateItemPrice takes the full contract item; this file only
            // ever holds the composed subset it actually reads, and the fields
            // that function uses are all present on it. Narrowed deliberately
            // rather than widening OrderItem to claim fields the templates
            // never touch.
            (calculateItemPrice(item as Parameters<typeof calculateItemPrice>[0], spots) ?? 0);

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
          <td>${scrap.content != null ? `${scrap.content.toFixed(3)} t oz` : "&mdash;"}</td>
          <td>${premium != null ? `${(premium * 100).toFixed(1)}%` : "&mdash;"}</td>
          <td class="text-right">${price ? formatCurrency(price) : "-"}</td>
        </tr>`;
    })
    .join("");

  return { rowsHtml, rawScrapItems };
}

export function buildInvoiceBullionRows(
  orderItems: OrderItem[],
  spots: SpotPart[]
): { rowsHtml: string; bullionOrderItems: OrderItem[] } {
  const bullionOrderItems = orderItems.filter(
    (item) => item.item_type === "product" && item.product
  );

  const rowsHtml = bullionOrderItems
    .map((item) => {
      const product: ProductPart = item.product ?? ({} as ProductPart);
      const unitPrice =
        item.price != null
          ? item.price
          : // calculateItemPrice takes the full contract item; this file only
            // ever holds the composed subset it actually reads, and the fields
            // that function uses are all present on it. Narrowed deliberately
            // rather than widening OrderItem to claim fields the templates
            // never touch.
            (calculateItemPrice(item as Parameters<typeof calculateItemPrice>[0], spots) ?? 0);
      const totalPrice = unitPrice * (item.quantity ?? 1);

      return `
        <tr>
          <td class="text-left">${
            product.name || "Bullion Product"
          }</td>
          <td>${item.quantity}</td>
          <td>${product.content != null ? `${product.content.toFixed(3)} t oz` : "&mdash;"}</td>
          <td>${
            item.premium != null ? `${(item.premium * 100).toFixed(1)}% of spot` : "&mdash;"
          }</td>
          <td class="text-right">${
            totalPrice ? formatCurrency(totalPrice) : "-"
          }</td>
        </tr>`;
    })
    .join("");

  return { rowsHtml, bullionOrderItems };
}

