// The HTML of every message the app sends.
//
// The templates are files on disk with [PLACEHOLDER] markers; these functions
// read them and substitute. Nothing here talks to a transport - see
// utils/sendEmail.ts for that seam.
import fs from "fs";
import path from "path";
import { formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.ts";
import { fileURLToPath } from "url";
// THE ORDER VIEW, which is the API's own read of one order put back together
// from its tables (D214 item 12). It replaces the composed sales order this
// file used to take as `Record<string, any>`.
import { bullionLines } from "#domain/pricing/service.ts";
import type { orders } from "@dorado/contracts";
import type { DocumentLabels } from "#domain/media/pdfs/render/sections.ts";

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

// The refiner's copy of a sales order: where it goes, what the metal was worth
// when the order was priced, and what to ship.
//
// TWO LIVE TypeErrors WERE FOUND HERE BY TYPING IT, both after the point of no
// return. sendOrderToRefiner attaches the refiner, creates the outbound
// shipment and sets order_sent in one transaction, and only then sends this -
// deliberately, so that the failure mode is an order marked sent rather than
// metal leaving the building against a rolled-back record. That makes anything
// that throws in here silent: the order says it was sent, and the refiner was
// never told.
//
//   `addr.line_1` on an order with no address. Production sales order 55 has
//   address_id NULL, a refiner attached and order_sent true.
//   `s.ask.toFixed(2)` on a spot with no ask. The ask is nullable.
//
// Neither is fixed by rendering something wrong instead. An order with no
// address must not reach a refiner at all, and domain/orders refuses it before
// the transaction rather than after. What is here is the second line of
// defence: a value the row calls nullable renders as a dash, and the message
// goes out.
type RefinerEmailInput = {
  firstName?: string | null;
  url?: string | null;
  order: orders.orders.View;
  /** metal_id -> the ask the order was priced at. */
  asks: ReadonlyMap<string, number | null>;
  labels: DocumentLabels;
};

// Renders a value that the row says can be missing. An em dash, never "null"
// and never a number that is not the number - a refiner reading $0.00 against
// a line of gold would believe it.
const orDash = (value: string | null | undefined): string =>
  value == null || value === "" ? "&mdash;" : value;

const money = (value: number | null | undefined): string =>
  value == null ? "&mdash;" : `$${value.toFixed(2)}`;

export function renderSalesOrderToSupplierEmail({
  firstName,
  url,
  order,
  asks,
  labels,
}: RefinerEmailInput): string {
  const templatesDir = path.join(__dirname, "..", "templates");
  const layoutPath = path.join(templatesDir, "baseLayout.raw.html");
  const contentPath = path.join(templatesDir, "salesOrderToSupplier.raw.html");
  const layout = fs.readFileSync(layoutPath, "utf8");
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

  const spotsHtml = [...labels.metals]
    .map(
      ([metal_id, name]) => `
    <tr>
      <td style="padding:4px 8px;">${name}</td>
      <td style="padding:4px 8px;text-align:right;">
        ${money(asks.get(metal_id))}
      </td>
    </tr>
  `
    )
    .join("");

  // `quantity * price` keeps its arithmetic rather than gaining a guard. Both
  // are nullable on the row and both multiply to 0 today, which shows the
  // refiner $0.00 for the line - wrong, but not a crash, and production has no
  // null price or quantity on any of its 14 sales order items.
  const orderRows = bullionLines(order.items)
    .map((line) => {
      const subtotal = ((line.quantity ?? 0) * (line.price ?? 0)).toFixed(2);
      return `
      <tr>
        <td style="padding:8px 0">${line.product?.name ?? ""}</td>
        <td style="padding:8px 0;text-align:center">${line.quantity}</td>
        <td style="padding:8px 0;text-align:right">$${subtotal}</td>
      </tr>
    `;
    })
    .join("");

  // totals.items is the sum of the lines. `?? 0` keeps a missing value from
  // crashing a send that happens after the order is already marked sent, per
  // this file's own second-line-of-defence rule.
  const total = (order.totals?.items ?? 0).toFixed(2);

  content = content
    .replace("[SHIPPING_ROWS]", shippingHtml)
    .replace("[SPOTS_ROWS]", spotsHtml)
    .replace("[ORDER_ROWS]", orderRows)
    .replace("[ORDER_TOTAL]", total)
    .replace("[ORDER_NUMBER]", formatSalesOrderNumber(order.order.number))
    .replace("[CUSTOMER_NAME]", order.user?.name ?? "");

  return layout.replace("[BODY]", content);
}
