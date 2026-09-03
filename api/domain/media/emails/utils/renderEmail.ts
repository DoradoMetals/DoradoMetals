// The HTML of every message the app sends - reads [PLACEHOLDER] template files on disk and substitutes; no transport here (see utils/sendEmail.ts).
import fs from "fs";
import path from "path";
import { formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.ts";
import { fileURLToPath } from "url";
// The COMPOSED sales order - an email needs it put back together, rendered server-side from the server's own read.
import type { ComposedSalesItem as SalesOrderItem } from "#domain/orders/compose.ts";
type SalesOrder = Record<string, any>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// firstName defaults, url is optional - what every caller relies on (most send only a name and a URL).
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

export function renderOrderPricedEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate("orderPriced.raw.html", { firstName, url });
}

// created_at/updated_at are Date here, not the wire's string - this renderer gets a database row pg already parsed (same reason sections.ts declares string | number | Date | null).
export type SalesOrderForRender = Omit<SalesOrder, "created_at" | "updated_at"> & {
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

// Converted spot spellings - only the metal's name and its ask are printed on the refiner's copy.
export type SupplierSpot = { name?: string | null; ask?: number | null };

type SupplierEmailInput = {
  firstName?: string | null;
  url?: string | null;
  order: SalesOrderForRender;
  spots: SupplierSpot[];
};

// Renders a value the wire says can be missing as an em dash - never "null", and never a number that isn't the number (a supplier reading $0.00 against gold would believe it).
const orDash = (value: string | null | undefined): string =>
  value == null || value === "" ? "&mdash;" : value;

const money = (value: number | null | undefined): string =>
  value == null ? "&mdash;" : `$${value.toFixed(2)}`;

// The refiner's copy: where it goes, what the metal was worth when priced, what to ship.
// Runs AFTER order_sent is already committed, so anything that throws here is silent - the order says sent, the refiner is never told. Two live TypeErrors were found this way (a null address, a null spot ask); features/sales-orders/service.ts now refuses those cases first - what's here is the second line of defence: a nullable value renders as a dash, never a crash.
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

  // quantity * price keeps its arithmetic rather than gaining a guard - both nullable on the wire, multiplying to 0 (wrong but not a crash); production has no null on either across all 14 sales order items today.
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

  // totals.items is nullable on the wire; `?? 0` keeps a missing value from crashing a send that happens after the order is already marked sent.
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
