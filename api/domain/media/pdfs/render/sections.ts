import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";
import { assignScrapItemNames } from "#domain/orders/items/utils/assignScrapNames.ts";
import { calculateItemPrice } from "#domain/pricing/service.ts";
import {
  formatCurrency,
  getItemPrice,
  getPayoutDelay,
} from "#domain/media/pdfs/render/format.ts";

// The HTML sections a rendered document is assembled from. Types here are LOCAL, not from @dorado/contracts, on purpose: the shape that arrives is COMPOSED (order_items nested with scrap/product, shipment, address), not a row, and spots arrive in the CONVERTED wire shape (name/ask/bid) - no generated row describes either.
// These interfaces name exactly the fields the templates read - deliberately narrow, so the type doubles as a list of what a caller must supply. Optional/unknown wherever the template already guards a missing value.

// Local like the order shapes: live spot rows and frozen order-spot rows share exactly these three fields (calculations.ts reads the same three).
export interface SpotPart {
  name?: string | null;
  ask?: number | null;
  bid?: number | null;
}
/** The scrap half of a line, when item_type is "scrap". `content` is nullable, not `number` required - every source of it admits null, and the templates already guard `scrap.content != null` before use.
 * Declared this way so a future reader doesn't delete that guard as "redundant". */
interface ScrapPart {
  name?: unknown;
  metal?: unknown;
  content?: number | null;
  purity?: number | null;
  pre_melt?: unknown;
  post_melt?: unknown;
  gross_unit?: unknown;
  bid_premium?: number | null;
}

/** The bullion half of a line, when item_type is "product". */
interface ProductPart {
  name?: unknown;
  metal_type?: unknown;
  content?: number | null;
  /** Products carry their own premiums; a line falls back to these when it has none. */
  bid_premium?: number | null;
  ask_premium?: number | null;
}

/** One line on an order, either scrap or bullion, never both. `product` is nullable; repos may emit an object of nulls, and every template read already chains. */
export interface OrderItem {
  item_type?: string;
  quantity?: number | null;
  price?: number | null;
  premium?: number | null;
  scrap?: ScrapPart | null;
  product?: ProductPart | null;
}

/** The address snapshot fields printed on a label block: recipient_name is who receives the shipment. */
interface AddressPart {
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
interface ShipmentPart {
  insured?: boolean | null;
  package?: string | null;
  shipping_charge?: number | null;
  [key: string]: unknown;
}

/** A purchase order as this file receives it - composed, not a row. */
export interface RenderableOrder {
  /**
   * NOT NULL in both schemas, but the contract admits null for six stray new-schema-only orders -
   * the templates guard the padStart rather than crash a document for the type's sake.
   */
  number?: string | number | null;
  /**
   * Nullable in the schema (though zero orders are null today) - typed as stored, not as it happens to be.
   * The template guards it: `new Date(undefined)` renders "Invalid Date", which would reach a customer looking deliberate.
   */
  created_at?: string | number | Date | null;
  /** One field for both directions - direction is the endpoint's. */
  status?: string | null;
  spots_locked?: boolean | null;
  address?: AddressPart | null;
  shipment?: ShipmentPart | null;
  return_shipment?: ShipmentPart | null;
  payout?: { method?: string | null; cost?: number | null } | null;
  carrier_pickup?: { pickup_requested_at?: string | number | Date | null } | null;
  user?: Record<string, unknown> | null;
  order_items?: OrderItem[];
  /** The money, nested under orders.transactions' names. The sales order invoice prints items/shipping/surcharge/funds/total off it. */
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

// An order with no address still has to render. Every one of these was `purchaseOrder.address.name`, throwing on a null address - the packing list was a 500 rather than a document (5 of dev's 16 purchase orders have no address_id, and it's not junk data).
// A blank line on a document is recoverable; a 500 when an admin asks for a packing list is not, and it gives no hint of what's wrong.
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
  // assignScrapItemNames takes the full contract item; this file only holds the composed subset templates read (deliberately narrowed, not a gap) - widening OrderItem to claim id/purchase_order_id/confirmed would assert fields these templates never touch.
  const scrapItemsWithNames = assignScrapItemNames(
    rawScrapItems as Parameters<typeof assignScrapItemNames>[0]
  ) as OrderItem[];

  return scrapItemsWithNames
    .map((item) => {
      const scrap: ScrapPart = item.scrap ?? {};
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
  // assignScrapItemNames takes the full contract item; this file only holds the composed subset templates read (deliberately narrowed, not a gap) - widening OrderItem to claim id/purchase_order_id/confirmed would assert fields these templates never touch.
  const scrapItemsWithNames = assignScrapItemNames(
    rawScrapItems as Parameters<typeof assignScrapItemNames>[0]
  ) as OrderItem[];

  const rowsHtml = scrapItemsWithNames
    .map((item) => {
      const scrap: ScrapPart = item.scrap ?? {};

      // The same fallback the packing list uses: without it, order 239's packing list showed 75.0% premium and the invoice showed 0.0% for the SAME line (`item.premium` null, `null * 100` is 0, not an error).
      // The invoice is the document that tells a customer what they're paid, so this must resolve `item.premium ?? scrap.bid_premium` the same way buildPackingScrapRows does.
      const premium = item.premium ?? scrap.bid_premium;

      const price =
        item.price != null
          ? item.price
          : // calculateItemPrice takes the full contract item; this file only
            // holds the composed subset it reads (narrowed deliberately, not widening OrderItem to claim fields templates never touch).
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
            // holds the composed subset it reads (narrowed deliberately, not widening OrderItem to claim fields templates never touch).
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

