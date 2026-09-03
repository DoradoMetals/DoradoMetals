import { requiredEnv } from "#shared/env/required.ts";
import * as pdfService from "#domain/media/pdfs/service.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import type { PurchaseDocument, SalesDocument } from "#domain/media/pdfs/service.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";

import {
  renderPurchaseOrderPlacedEmail,
  renderOrderPricedEmail,
  renderSalesOrderToSupplierEmail,
  renderAccountCreatedEmail,
  renderVerifyEmail,
} from "#domain/media/emails/utils/renderEmail.ts";
import { sendEmail } from "#providers/emails/nodemailer.ts";
import { recordEmail, messageIdOf } from "#domain/media/emails/record.ts";
import { persistPdf } from "#domain/media/pdfs/store.ts";
import type { PoolClient } from "pg";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

// `transport` is a separate parameter, not a field on the input object: the
// controller passes an id as the input, so a field would be reachable from the
// request. In production nothing passes one and the shared transport is used.
//
// EVERY SENDER TAKES AN ORDER ID (ruling 10). They used to take a whole
// composed order out of `req.body` - which meant a customer's confirmation was
// rendered from numbers the customer's browser supplied, and `to:` was an
// address out of that same body: an open relay on the business's own domain,
// subject "Your Order Has Been Placed!", with an attachment the caller also
// chose. The recipient is resolved from the stored order now, and the render
// inputs come from domain/media/pdfs/order-inputs.ts.
//
// AFTER THE COMMIT, NEVER INSIDE IT. An email cannot be rolled back, which is
// the rule shared/db/tests/transaction-side-effects.test.ts fails the build
// over.
//
// `transport` and `executor` are the usual test seams.

// D91: THE CONFIRMATION EMAIL IS THE SERVER'S TO SEND, keyed by order id.
//
// IT DOES NOT THROW. The order exists and is paid for by the time this runs -
// failing the response over an email would be a worse outcome than a missing
// one, and the send is not silent either way: recordEmail writes a
// media.emails row with status 'failed' and the error, which is the paper
// trail the browser version never had.
export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  try {
    const input = await inputs.packingListInputs(order_id, executor);
    const to = input.order.user?.email;
    if (typeof to !== "string" || to.length === 0) return;

    await sendCreatedEmail(input, to, transport, executor);
  } catch (err) {
    // sendCreatedEmail already recorded a failed send if it got that far; anything else (a failed read, an unresolved package) is logged and dropped - the order is placed either way.
    console.error(`confirmation email for order ${order_id} was not sent:`, err);
  }
}

export async function sendCreatedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  // Paper-trail writes join a test's transaction through this; production omits it and the records go to the pool, after the send.
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generatePackingList(input);

  // The order being placed IS the status event: the document persists once here, and the send record points at it - neither may break the send.
  const order_id = input.order.order.id;
  const pdfId = await persistPdf(
    { kind: "packing_list", order_id, bytes: pdfBuffer }, executor
  );

  const subject = "Your Order Has Been Placed!";
  const record = {
    kind: "purchase_order_created" as const,
    to, subject, order_id, pdf_id: pdfId,
    user_id: input.order.user?.id ?? null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderPurchaseOrderPlacedEmail({
        firstName: input.order.user?.name ?? "",
        url: `${requiredEnv("FRONTEND_URL")}/account?tab=sold`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            input.order.order.number
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

// The customer's copy of a finalised price, with the invoice attached.
export async function sendPricedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateInvoice(input);
  } catch (err) {
    // `err` is unknown in a strict file, and rethrowing a non-Error unchanged
    // is better than crashing while trying to annotate it.
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const order_id = input.order.order.id;
  const pdfId = await persistPdf({ kind: "invoice", order_id, bytes: pdfBuffer }, executor);

  const subject =
    `Your Order Has Been Priced - Order ${formatPurchaseOrderNumber(input.order.order.number)}`;
  const record = {
    kind: "purchase_order_priced" as const,
    to, subject, order_id, pdf_id: pdfId,
    user_id: input.order.user?.id ?? null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderOrderPricedEmail({
        firstName: input.order.user?.name ?? "",
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            input.order.order.number
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

// The refiner's copy of a sales order, with the invoice attached.
//
// `email` is not from a request body - this is not a route. It is called with
// the refiner's own address, resolved from the refiner the order was sent to.
export async function sendSalesOrderToSupplier(
  input: SalesDocument,
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const { order, asks, labels } = input;
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateSalesOrderInvoice(input);
  } catch (err) {
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const order_id = order.order.id;
  const pdfId = await persistPdf(
    { kind: "sales_order_invoice", order_id, bytes: pdfBuffer }, executor
  );

  const subject =
    `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.order.number)}`;
  const record = {
    kind: "sales_order_to_supplier" as const,
    to: email, subject, order_id, pdf_id: pdfId,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to: email,
      subject,
      html: renderSalesOrderToSupplierEmail({
        firstName: order.user?.name ?? "",
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
        order,
        asks,
        labels,
      }),
      attachments: [
        {
          filename: `${formatSalesOrderNumber(order.order.number)}_invoice.pdf`,
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
