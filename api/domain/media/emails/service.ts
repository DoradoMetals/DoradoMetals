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
import { attempt } from "#shared/attempt.ts";
import type { PoolClient } from "pg";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`order placed confirmation for ${order_id}`, async () => {
    const input = await inputs.packingListInputs(order_id, executor);
    const to = input.order.user?.email;
    if (typeof to !== "string" || to.length === 0) return;
    await sendCreatedEmail(input, to, transport, executor);
  });
}

export async function sendCreatedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generatePackingList(input);
  const order_id = input.order.order.id;
  const pdfId = await persistPdf(
    { kind: "packing_list", order_id, bytes: pdfBuffer }, executor
  );

  const subject = "Your Order Has Been Placed!";
  const result = await sendEmail({
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

  await recordEmail(
    { kind: "purchase_order_created", to, subject, order_id, pdf_id: pdfId, user_id: input.order.user?.id ?? null },
    { status: "sent", provider_message_id: messageIdOf(result) },
    executor
  );
}

export async function sendPricedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generateInvoice(input);
  const order_id = input.order.order.id;
  const pdfId = await persistPdf({ kind: "invoice", order_id, bytes: pdfBuffer }, executor);

  const subject =
    `Your Order Has Been Priced - Order ${formatPurchaseOrderNumber(input.order.order.number)}`;
  const result = await sendEmail({
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

  await recordEmail(
    { kind: "purchase_order_priced", to, subject, order_id, pdf_id: pdfId, user_id: input.order.user?.id ?? null },
    { status: "sent", provider_message_id: messageIdOf(result) },
    executor
  );
}

export async function sendSalesOrderToSupplier(
  input: SalesDocument,
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const { order, asks, labels } = input;
  const pdfBuffer = await pdfService.generateSalesOrderInvoice(input);
  const order_id = order.order.id;
  const pdfId = await persistPdf(
    { kind: "sales_order_invoice", order_id, bytes: pdfBuffer }, executor
  );

  const subject =
    `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.order.number)}`;
  const result = await sendEmail({
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

  await recordEmail(
    { kind: "sales_order_to_supplier", to: email, subject, order_id, pdf_id: pdfId },
    { status: "sent", provider_message_id: messageIdOf(result) },
    executor
  );
}

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

  const result = await sendEmail({
    to: user.email,
    subject,
    text: `Click the link to verify your email: ${url}`,
    html: isSignUp
      ? renderAccountCreatedEmail({ firstName: String(user.name ?? ""), url })
      : renderVerifyEmail({ firstName: String(user.name ?? ""), url }),
  }, transport);

  await recordEmail(
    { kind: "auth_verification", to: user.email, subject, user_id: typeof user.id === "string" ? user.id : null },
    { status: "sent", provider_message_id: messageIdOf(result) },
    executor
  );
}
