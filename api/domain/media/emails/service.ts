import { requiredEnv } from "#shared/env/required.ts";
import * as pdfService from "#domain/media/pdfs/service.ts";
import type { PackingListInput, InvoiceInput } from "#domain/media/pdfs/service.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";

import {
  renderPurchaseOrderPlacedEmail,
  renderOrderPricedEmail,
  renderSalesOrderToSupplierEmail,
  renderAccountCreatedEmail,
  renderVerifyEmail,
} from "#domain/media/emails/utils/renderEmail.ts";
import type { SalesOrderForRender, SupplierSpot } from "#domain/media/emails/utils/renderEmail.ts";

import { sendEmail } from "#providers/emails/nodemailer.ts";
import * as purchaseOrderReads from "#domain/orders/read.service.ts";
// The live spot feed - the same read the pricing paths use (spots.spots, converted names).
import * as spotsFeed from "#domain/spots/service.ts";
import * as packages from "#db/shipping/packages/repo.ts";
import * as shipmentOrderRead from "#domain/shipping/shipments/order-read.ts";
import { recordEmail, messageIdOf } from "#domain/media/emails/record.ts";
import { persistPdf } from "#domain/media/pdfs/store.ts";
import type { PoolClient } from "pg";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

// `transport` and `to` are separate params, not fields of the input object (req.body) - the recipient is resolved and authorised by the controller from the stored order, so no caller can redirect the send or supply its own recipient (an open-relay/phishing hazard otherwise).
// `user_name` comes off RenderableOrder.user (`Record<string, unknown>`, not contract-pinned) and is coerced rather than asserted, since an unexpected shape would render "[object Object]" into a customer's greeting.
// Runs AFTER the commit, never inside it - an email can't be rolled back (shared/db/transaction-side-effects.test.js enforces this). Never throws: recordEmail writes the outcome, including a failed send, rather than failing the response over mail.
export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  try {
    const purchaseOrder = (await purchaseOrderReads.findPurchaseById(order_id, executor)) as
      | (Record<string, any> & { user?: { user_email?: string | null } | null })
      | null;
    if (!purchaseOrder) return;

    const to = purchaseOrder.user?.user_email;
    if (typeof to !== "string" || to.length === 0) return;

    // Packing list inputs resolved server-side: the live spot feed, and the package actually booked with the parcel (shipping.shipments/packages).
    const spotPrices = await spotsFeed.getSpotPrices(executor);
    const [shipment] = await shipmentOrderRead.getForOrder(order_id, executor);
    const pkg = shipment?.package_id
      ? await packages.getOne(shipment.package_id, executor)
      : undefined;
    const packageDetails = pkg
      ? {
          label: pkg.label,
          dimensions: {
            length: Number(pkg.length),
            width: Number(pkg.width),
            height: Number(pkg.height),
          },
        }
      : undefined;

    await sendCreatedEmail(
      { purchaseOrder, spotPrices, packageDetails } as PackingListInput,
      to,
      transport,
      executor
    );
  } catch (err) {
    // sendCreatedEmail already recorded a failed send if it got that far; anything else (a failed read, an unresolved package) is logged and dropped - the order is placed either way.
    console.error(`confirmation email for order ${order_id} was not sent:`, err);
  }
}

export async function sendCreatedEmail(
  { purchaseOrder, spotPrices, packageDetails }: PackingListInput,
  to: string,
  transport?: Transport,
  // Paper-trail writes join a test's transaction through this; production omits it and the records go to the pool, after the send.
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
  });

  // The order being placed IS the status event: the document persists once here, and the send record points at it - neither may break the send.
  const orderId = typeof purchaseOrder.id === "string" ? purchaseOrder.id : null;
  const pdfId = await persistPdf({ kind: "packing_list", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = "Your Order Has Been Placed!";
  const record = {
    kind: "purchase_order_created" as const,
    to, subject, order_id: orderId, pdf_id: pdfId,
    user_id: typeof purchaseOrder.user?.user_id === "string" ? purchaseOrder.user.user_id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderPurchaseOrderPlacedEmail({
        firstName: String(purchaseOrder.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/account?tab=sold`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            purchaseOrder.number
          )}_packing_list.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail(
      record, { status: "failed", error: err instanceof Error ? err.message : String(err) }, executor
    );
    throw err;
  }
  await recordEmail(record, { status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// Field names differ from InvoiceInput's on purpose: snake_case here matches what the controller destructures from req.body; renaming either side would be a wire change.
export async function sendPricedEmail(
  {
    order,
    order_spots,
    spot_prices,
  }: {
    order: InvoiceInput["purchaseOrder"];
    order_spots?: InvoiceInput["orderSpots"];
    spot_prices?: InvoiceInput["spotPrices"];
  },
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateInvoice({
      purchaseOrder: order,
      orderSpots: order_spots,
      spotPrices: spot_prices,
    });
  } catch (err) {
    // err is unknown in a strict file; rethrow non-Error unchanged rather than crash annotating it.
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const orderId = typeof order.id === "string" ? order.id : null;
  const pdfId = await persistPdf({ kind: "invoice", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = `Your Order Has Been Priced - Order ${formatPurchaseOrderNumber(order.number)}`;
  const record = {
    kind: "purchase_order_priced" as const,
    to, subject, order_id: orderId, pdf_id: pdfId,
    user_id: typeof order.user?.user_id === "string" ? order.user.user_id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderOrderPricedEmail({
        firstName: String(order.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            order.number
          )}_invoice.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail(
      record, { status: "failed", error: err instanceof Error ? err.message : String(err) }, executor
    );
    throw err;
  }
  await recordEmail(record, { status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// SalesOrderForRender's created_at/updated_at can be Date, not just string - the caller passes a database row (pg already parses these), not the wire contract.
// generateSalesOrderInvoice takes RenderableOrder, deliberately loose (what a template needs, not what a sales order is) - one object handed to both consumers.

export async function sendSalesOrderToSupplier(
  order: SalesOrderForRender,
  spots: SupplierSpot[],
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateSalesOrderInvoice({
      salesOrder: order,
      spots,
    });
  } catch (err) {
    // err is unknown in a strict file; rethrow non-Error unchanged rather than crash annotating it.
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const orderId = typeof order.id === "string" ? order.id : null;
  const pdfId = await persistPdf({ kind: "sales_order_invoice", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.number)}`;
  const record = {
    kind: "sales_order_to_supplier" as const,
    to: email, subject, order_id: orderId, pdf_id: pdfId,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      // email is not from a request body - sendSalesOrderToSupplier isn't a route; it's called with the refiner's address the order was placed against.
      to: email,
      subject,
      html: renderSalesOrderToSupplierEmail({
        firstName: String(order.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
        order,
        spots,
      }),
      attachments: [
        {
          filename: `${formatSalesOrderNumber(order.number)}_invoice.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail(
      record, { status: "failed", error: err instanceof Error ? err.message : String(err) }, executor
    );
    throw err;
  }
  await recordEmail(record, { status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// better-auth calls a callback this codebase owns (features/auth/client.ts -> emailVerification.sendVerificationEmail), which calls this sender - so the mail leaves a media.emails row like every other, failure included.
// No order/PDF (order_id, pdf_id stay null); user.id is real since better-auth commits the user first - recordEmail swallows a refused FK to stderr either way.
export async function sendAuthVerificationEmail(
  {
    user,
    url,
    isSignUp = false,
  }: {
    user: { id?: string | null; email: string; name?: string | null };
    url: string;
    isSignUp?: boolean;
  },
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const subject = isSignUp
    ? "Welcome to Dorado Metals Exchange"
    : "Verify Your Email Address";

  const record = {
    kind: "auth_verification" as const,
    to: user.email,
    subject,
    user_id: typeof user.id === "string" ? user.id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to: user.email,
      subject,
      text: `Click the link to verify your email: ${url}`,
      html: isSignUp
        ? renderAccountCreatedEmail({ firstName: String(user.name ?? ""), url })
        : renderVerifyEmail({ firstName: String(user.name ?? ""), url }),
    }, transport);
  } catch (err) {
    await recordEmail(
      record, { status: "failed", error: err instanceof Error ? err.message : String(err) }, executor
    );
    throw err;
  }
  await recordEmail(record, { status: "sent", provider_message_id: messageIdOf(result) }, executor);
}
