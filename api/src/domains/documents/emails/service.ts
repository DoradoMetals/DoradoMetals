import { requiredEnv } from '#shared/env/required.ts'
import * as pdfService from '#documents/pdfs/service.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import type { PurchaseDocument, SalesDocument } from '#documents/pdfs/service.ts'
import type { Transport } from '#providers/emails/nodemailer.ts'

import {
  renderPurchaseOrderPlacedEmail,
  renderSalesOrderPlacedEmail,
  renderOrderPricedEmail,
  renderSalesOrderToSupplierEmail,
  renderAccountCreatedEmail,
  renderVerifyEmail,
} from '#documents/emails/utils/renderEmail.ts'
import { deliver } from '#providers/emails/nodemailer.ts'
import * as rules from '#documents/emails/rules.ts'
import { recordEmail } from '#documents/emails/record.ts'
import { persistPdf } from '#documents/pdfs/store.ts'
import { attempt } from '#shared/attempt.ts'
import type { PoolClient } from 'pg'
import type { EmailRecipient } from '@dorado/contracts'
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '#shared/utils/formatOrderNumbers.ts'


export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`order placed confirmation for ${order_id}`, async () => {
    const input = await inputs.packingListInputs(order_id, executor)
    const to = input.order.user?.email
    if (typeof to !== 'string' || to.length === 0) return
    await sendCreatedEmail(input, to, transport, executor)
  })
}

export async function sendCreatedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  // A buyer ships nothing. The packing list is purchase-shaped throughout - it
  // says "put this in your package", prints Dorado as the recipient, formats a
  // PO number and embeds an inbound label a sale does not have (LD F10) - so a
  // sale's confirmation carries its own invoice, and files itself under its
  // own kind.
  const isSale = input.order.order.direction === 'sale'
  const pdfBuffer = isSale
    ? await pdfService.generateSalesOrderInvoice(input)
    : await pdfService.generatePackingList(input)
  const order_id = input.order.order.id
  const pdfId = await persistPdf(
    isSale ? 'sales_order_invoice' : 'packing_list',
    order_id,
    pdfBuffer,
    executor
  )

  const renderPlaced = isSale ? renderSalesOrderPlacedEmail : renderPurchaseOrderPlacedEmail
  const formatOrderNumber = isSale ? formatSalesOrderNumber : formatPurchaseOrderNumber

  const subject = 'Your Order Has Been Placed!'
  const delivery = await deliver(
    {
      to,
      subject,
      html: renderPlaced({
        firstName: input.order.user?.name ?? '',
        url: `${requiredEnv('FRONTEND_URL')}/account?tab=${isSale ? 'bought' : 'sold'}`,
      }),
      attachments: [
        {
          filename: `${formatOrderNumber(input.order.order.number)}_${
            isSale ? 'invoice' : 'packing_list'
          }.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    },
    transport
  )

  await recordEmail(
    {
      kind: isSale ? 'sales_order_created' : 'purchase_order_created',
      to,
      subject,
      order_id,
      pdf_id: pdfId,
      user_id: input.order.user?.id ?? null,
    },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}

export async function sendPricedEmail(
  input: PurchaseDocument,
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generateInvoice(input)
  const order_id = input.order.order.id
  const pdfId = await persistPdf('invoice', order_id, pdfBuffer, executor)

  const subject = `Your Order Has Been Priced - Order ${formatPurchaseOrderNumber(input.order.order.number)}`
  const delivery = await deliver(
    {
      to,
      subject,
      html: renderOrderPricedEmail({
        firstName: input.order.user?.name ?? '',
        url: `${requiredEnv('FRONTEND_URL')}/orders`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(input.order.order.number)}_invoice.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    },
    transport
  )

  await recordEmail(
    {
      kind: 'purchase_order_priced',
      to,
      subject,
      order_id,
      pdf_id: pdfId,
      user_id: input.order.user?.id ?? null,
    },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}

export async function sendSalesOrderToSupplier(
  input: SalesDocument,
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const { order, pricing } = input
  const pdfBuffer = await pdfService.generateSalesOrderInvoice(input)
  const order_id = order.order.id
  const pdfId = await persistPdf('sales_order_invoice', order_id, pdfBuffer, executor)

  const subject = `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.order.number)}`
  const delivery = await deliver(
    {
      to: email,
      subject,
      html: renderSalesOrderToSupplierEmail({
        firstName: order.user?.name ?? '',
        url: `${requiredEnv('FRONTEND_URL')}/orders`,
        order,
        pricing,
      }),
      attachments: [
        {
          filename: `${formatSalesOrderNumber(order.order.number)}_invoice.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    },
    transport
  )

  await recordEmail(
    { kind: 'sales_order_to_supplier', to: email, subject, order_id, pdf_id: pdfId },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}

export async function sendAuthVerificationEmail(
  user: EmailRecipient,
  url: string,
  isSignUp: boolean,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const subject = isSignUp ? 'Welcome to Dorado Metals Exchange' : 'Verify Your Email Address'

  const delivery = await deliver(
    {
      to: user.email,
      subject,
      text: `Click the link to verify your email: ${url}`,
      html: isSignUp
        ? renderAccountCreatedEmail({ firstName: String(user.name ?? ''), url })
        : renderVerifyEmail({ firstName: String(user.name ?? ''), url }),
    },
    transport
  )

  await recordEmail(
    {
      kind: 'auth_verification',
      to: user.email,
      subject,
      user_id: typeof user.id === 'string' ? user.id : null,
    },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}
