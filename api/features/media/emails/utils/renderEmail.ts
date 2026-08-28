// The HTML of every message the app sends.
//
// The templates are files on disk with [PLACEHOLDER] markers; these functions
// read them and substitute. Nothing here talks to a transport - see
// utils/sendEmail.ts for that seam.
import fs from "fs";
import path from "path";
import { formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.ts";
import { fileURLToPath } from "url";
import type { SalesOrder, SalesOrderItem } from "@dorado/contracts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// firstName has a default and url is optional, which is what every caller
// relies on: most send only a name and a URL. offerExpiration left with the
// offers themselves - nothing rendered it but the offer-sent template, and
// both are gone.
type TemplateVars = {
  firstName?: string | null;
  url?: string | null;
};

function renderTemplate(
  contentFile: string,
  { firstName = "there", url }: TemplateVars
): string {
  const templatesDir = path.join(__dirname, "..", "templates"); // <-- key change

  const layoutPath = path.join(templatesDir, "baseLayout.raw.html");
  const contentPath = path.join(templatesDir, contentFile);

  const layout = fs.readFileSync(layoutPath, "utf8");
  const content = fs.readFileSync(contentPath, "utf8");

  const safeUrl = url ?? "https://www.doradometals.com";

  return layout
    .replace("[BODY]", content)
    .replace(/\[First Name\]/g, firstName ?? "there")
    .replace(/\[URL\]/g, safeUrl);
}

export function renderAccountCreatedEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("accountCreated.raw.html", { firstName, url });
}

export function renderResetPasswordEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("resetPassword.raw.html", { firstName, url });
}

export function renderVerifyEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("verifyEmail.raw.html", { firstName, url });
}

export function renderChangeEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("changeEmail.raw.html", { firstName, url });
}

export function renderCreateAccountEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("createAccount.raw.html", { firstName, url });
}

export function renderPurchaseOrderPlacedEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("purchaseOrderPlaced.raw.html", { firstName, url });
}

export function renderSalesOrderPlacedEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("salesOrderPlaced.raw.html", { firstName, url });
}

// renderOfferSentEmail IS GONE with the offers (Jacob, 28 August: "we're
// removing ANYTHING related to offers"). Nothing but its own test called it -
// the offer flow left with 086 - and its template went with it.

export function renderOrderPricedEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("orderPriced.raw.html", { firstName, url });
}

// TIMESTAMPS ARE Date HERE, NOT string. Contracts describe the wire, so
// SalesOrder says `created_at: string` - but what reaches this
// renderer is what getById returned, a database row whose timestamps pg has
// already parsed. The template only ever formats them, and
// features/pdf/render/sections.ts declares `string | number | Date | null`
// for exactly this reason.
export type SalesOrderForRender = Omit<SalesOrder, "created_at" | "updated_at"> & {
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

// The converted spot spellings (D84). Only the metal's name and its ask are
// printed on the refiner's copy.
export type SupplierSpot = { name?: string | null; ask?: number | null };

type SupplierEmailInput = {
  firstName?: string | null;
  url?: string | null;
  order: SalesOrderForRender;
  spots: SupplierSpot[];
};

// Renders a value that the wire says can be missing. An em dash, never "null"
// and never a number that is not the number - a supplier reading $0.00 against
// a line of gold would believe it.
const orDash = (value: string | null | undefined): string =>
  value == null || value === "" ? "&mdash;" : value;

const money = (value: number | null | undefined): string =>
  value == null ? "&mdash;" : `$${value.toFixed(2)}`;

// The refiner's copy of a sales order: where it goes, what the metal was worth
// when the order was priced, and what to ship.
//
// TWO LIVE TypeErrors WERE FOUND HERE BY TYPING IT, both after the point of no
// return. sendOrderToSupplier attaches the supplier, creates the outbound
// shipment and sets order_sent in one transaction, and only then sends this -
// deliberately, so that the failure mode is an order marked sent rather than
// metal leaving the building against a rolled-back record. That makes anything
// that throws in here silent: the order says it was sent, and the refiner was
// never told.
//
//   `addr.line_1` on an order with no address. SalesOrder says
//   `address: OrderAddressSnapshot.nullable()`, and it means it - production sales
//   order 55 has address_id NULL, a supplier attached and order_sent true. The
//   invoice PDF built for that order does not read the address at all, so the
//   document is fine and the render is what falls over.
//
//   `s.ask.toFixed(2)` on a spot with no ask. The ask is nullable on the
//   wire; production's four metals all have one, and the spots come from the
//   request body rather than the database, so nothing guarantees it.
//
// Neither is fixed by rendering something wrong instead. An order with no
// address must not reach a supplier at all, and features/sales-orders/service.js
// now refuses it before the transaction rather than after. What is here is the
// second line of defence: a value the wire calls nullable renders as a dash,
// and the message goes out.
export function renderSalesOrderToSupplierEmail({
  firstName,
  url,
  order,
  spots,
}: SupplierEmailInput): string {
  const templatesDir = path.join(__dirname, "..", "templates");
  const layoutPath = path.join(templatesDir, "baseLayout.raw.html");
  const contentPath = path.join(templatesDir, "salesOrderToSupplier.raw.html");
  let layout = fs.readFileSync(layoutPath, "utf8");
  let content = fs.readFileSync(contentPath, "utf8");

  content = content
    .replace(/\[First Name\]/g, firstName ?? "there")
    .replace(/href=""/g, `href="${url ?? ""}"`);

  const addr = order.address;
  const shippingHtml = [
    `<tr><td style="padding:4px 8px;"><strong>Street 1:</strong> ${orDash(addr?.line_1)}</td></tr>`,
    addr?.line_2 &&
      `<tr><td style="padding:4px 8px;"><strong>Street 2:</strong> ${addr.line_2}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>City:</strong> ${orDash(addr?.city)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>State:</strong> ${orDash(addr?.state)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>Zip Code:</strong> ${orDash(addr?.zip)}</td></tr>`,
  ]
    .filter(Boolean)
    .join("");

  const spotsHtml = spots
    .map(
      (s: SupplierSpot) => `
    <tr>
      <td style="padding:4px 8px;">${s.name}</td>
      <td style="padding:4px 8px;text-align:right;">
        ${money(s.ask)}
      </td>
    </tr>
  `
    )
    .join("");

  // `quantity * price` keeps its arithmetic rather than gaining a guard. Both
  // are nullable on the wire and both multiply to 0 today, which shows the
  // supplier $0.00 for the line - wrong, but not a crash, and production has no
  // null price or quantity on any of its 14 sales order items. Changing what it
  // prints is a display decision, and this commit is for the two throws.
  const orderRows = order.order_items
    .map((item: SalesOrderItem) => {
      const subtotal = (item.quantity! * item.price!).toFixed(2);
      return `
      <tr>
        <td style="padding:8px 0">${item.product?.name}</td>
        <td style="padding:8px 0;text-align:center">${item.quantity}</td>
        <td style="padding:8px 0;text-align:right">$${subtotal}</td>
      </tr>
    `;
    })
    .join("");

  // totals.items is what item_total was: the sum of the lines. Nullable on
  // the Next wire where the old field was declared required - `?? 0` keeps a
  // missing value from crashing a send that happens after the order is
  // already marked sent, per this file's own second-line-of-defence rule.
  const total = (order.totals?.items ?? 0).toFixed(2);

  content = content
    .replace("[SHIPPING_ROWS]", shippingHtml)
    .replace("[SPOTS_ROWS]", spotsHtml)
    .replace("[ORDER_ROWS]", orderRows)
    .replace("[ORDER_TOTAL]", total)
    .replace("[ORDER_NUMBER]", formatSalesOrderNumber(order.number))
    .replace("[CUSTOMER_NAME]", order.user.user_name ?? "");

  return layout.replace("[BODY]", content);
}
