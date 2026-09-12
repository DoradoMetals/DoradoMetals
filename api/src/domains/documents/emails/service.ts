import * as pdfService from '#documents/pdfs/service.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import type { DocumentInput } from '@dorado/contracts'
import type { Attachment, Transport } from '#providers/resend/index.ts'

import * as mailers from '#db/media/emails/repo.ts'
import * as orderReceived from '#documents/emails/templates/order-received.ts'
import * as payoutSent from '#documents/emails/templates/payout-sent.ts'
import * as shipmentSent from '#documents/emails/templates/shipment-sent.ts'
import * as shipmentReceived from '#documents/emails/templates/shipment-received.ts'
import * as pickupBooked from '#documents/emails/templates/pickup-booked.ts'
import * as pickupComplete from '#documents/emails/templates/pickup-complete.ts'
import * as appointmentBooked from '#documents/emails/templates/appointment-booked.ts'
import * as appointmentTomorrow from '#documents/emails/templates/appointment-tomorrow.ts'
import * as documentSent from '#documents/emails/templates/document-sent.ts'
import * as signInCode from '#documents/emails/templates/sign-in-code.ts'
import * as accountCreated from '#documents/emails/templates/account-created.ts'
import * as detailsChanged from '#documents/emails/templates/details-changed.ts'
import * as voicemailReceived from '#documents/emails/templates/voicemail-received.ts'
import * as promo from '#documents/emails/templates/promo.ts'
import { renderSalesOrderToSupplierEmail } from '#documents/emails/utils/renderEmail.ts'
import { requiredEnv } from '#shared/env/required.ts'

import { deliver } from '#providers/resend/index.ts'
import type { ResendEvent } from '#providers/resend/index.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as rules from '#documents/emails/rules.ts'
import { recordEmail } from '#documents/emails/record.ts'
import type { EmailKind } from '#documents/emails/record.ts'
import { persistPdf } from '#documents/pdfs/store.ts'
import { attempt } from '#shared/attempt.ts'
import type { PoolClient } from 'pg'
import type {
  AccountCreatedMail,
  DetailsChangedMail,
  MailerAddressee,
  PromoMail,
  SignInCodeMail,
  VoicemailReceivedMail,
} from '@dorado/contracts'
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '#shared/utils/formatOrderNumbers.ts'

async function post(
  kind: EmailKind,
  to: MailerAddressee,
  subject: string,
  html: string,
  attachments: Attachment[],
  pdf_id: string | null,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  if (rules.suppressible(kind) && (await mailers.isSuppressed(to.email, executor))) return
  const delivery = await deliver(
    { to: to.email, subject, html, attachments, tags: [{ name: 'kind', value: kind }] },
    transport
  )
  await recordEmail(
    { kind, to: to.email, subject, order_id: to.order_id, pdf_id, user_id: to.user_id },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}

async function sentAlready(
  kind: EmailKind,
  order_id: string,
  executor?: PoolClient
): Promise<boolean> {
  return await mailers.hasSent(order_id, [kind], executor)
}

export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`order received mailer for ${order_id}`, async () => {
    await sendOrderReceived(order_id, transport, executor)
  })
}

export async function sendOrderReceived(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const mail = await mailers.orderReceived(order_id, executor)
  if (!mail || mail.email.length === 0) return

  const isSale = mail.direction === 'sale'
  const input = await inputs.packingListInputs(order_id, executor)
  const bytes = isSale
    ? await pdfService.generateInvoice(input)
    : await pdfService.generatePackingList(input)
  const pdf_id = await persistPdf(
    isSale ? 'sales_order_invoice' : 'packing_list',
    order_id,
    bytes,
    executor
  )
  const number = isSale
    ? formatSalesOrderNumber(mail.order_number)
    : formatPurchaseOrderNumber(mail.order_number)

  await post(
    isSale ? 'sales_order_created' : 'purchase_order_created',
    mail,
    orderReceived.subject(mail),
    orderReceived.render(mail),
    [
      {
        filename: `${number}_${isSale ? 'invoice' : 'packing_list'}.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      },
    ],
    pdf_id,
    transport,
    executor
  )
}

export async function sendDocument(
  order_id: string,
  label: string,
  bytes: Uint8Array,
  pdf_id: string | null,
  kind: EmailKind = 'document_sent',
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const mail = await mailers.documentSent(order_id, label, bytes.length, executor)
  if (!mail || mail.email.length === 0) return

  await post(
    kind,
    mail,
    documentSent.subject(mail),
    documentSent.render(mail),
    [
      {
        filename: `${label.toLowerCase().replace(/\s+/g, '_')}.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      },
    ],
    pdf_id,
    transport,
    executor
  )
}

export async function sendPricedEmail(
  input: DocumentInput,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const order_id = input.order.order.id
  const bytes = await pdfService.generateInvoice(input)
  const pdf_id = await persistPdf('invoice', order_id, bytes, executor)
  await sendDocument(
    order_id,
    'Invoice',
    bytes,
    pdf_id,
    'purchase_order_priced',
    transport,
    executor
  )
}

export async function sendShipmentSent(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`shipment sent mailer for ${order_id}`, async () => {
    if (await sentAlready('shipment_sent', order_id, executor)) return
    const mail = await mailers.shipmentSent(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'shipment_sent',
      mail,
      shipmentSent.subject(mail),
      shipmentSent.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendShipmentReceived(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`shipment received mailer for ${order_id}`, async () => {
    if (await sentAlready('shipment_received', order_id, executor)) return
    const mail = await mailers.shipmentReceived(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'shipment_received',
      mail,
      shipmentReceived.subject(mail),
      shipmentReceived.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendPickupBooked(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`pickup booked mailer for ${order_id}`, async () => {
    if (await sentAlready('pickup_booked', order_id, executor)) return
    const mail = await mailers.pickupBooked(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'pickup_booked',
      mail,
      pickupBooked.subject(mail),
      pickupBooked.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendPickupComplete(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`pickup complete mailer for ${order_id}`, async () => {
    if (await sentAlready('pickup_complete', order_id, executor)) return
    const mail = await mailers.pickupComplete(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'pickup_complete',
      mail,
      pickupComplete.subject(mail),
      pickupComplete.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendAppointmentBooked(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`appointment booked mailer for ${order_id}`, async () => {
    if (await sentAlready('appointment_booked', order_id, executor)) return
    const mail = await mailers.appointmentBooked(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'appointment_booked',
      mail,
      appointmentBooked.subject(mail),
      appointmentBooked.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendAppointmentTomorrow(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`appointment reminder for ${order_id}`, async () => {
    if (await sentAlready('appointment_tomorrow', order_id, executor)) return
    const mail = await mailers.appointmentTomorrow(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'appointment_tomorrow',
      mail,
      appointmentTomorrow.subject(mail),
      appointmentTomorrow.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendTomorrowsReminders(
  transport?: Transport,
  executor?: PoolClient
): Promise<number> {
  const due = await mailers.appointmentsDueTomorrow(executor)
  for (const order_id of due) {
    await sendAppointmentTomorrow(order_id, transport, executor)
  }
  return due.length
}

export async function sendPayoutSent(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await attempt(`payout sent mailer for ${order_id}`, async () => {
    if (await sentAlready('payout_sent', order_id, executor)) return
    const mail = await mailers.payoutSent(order_id, executor)
    if (!mail || mail.email.length === 0) return
    await post(
      'payout_sent',
      mail,
      payoutSent.subject(mail),
      payoutSent.render(mail),
      [],
      null,
      transport,
      executor
    )
  })
}

export async function sendSignInCode(
  mail: SignInCodeMail,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await post(
    'sign_in_code',
    mail,
    signInCode.subject(),
    signInCode.render(mail),
    [],
    null,
    transport,
    executor
  )
}

export async function sendAccountCreated(
  mail: AccountCreatedMail,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await post(
    'account_created',
    mail,
    accountCreated.subject(),
    accountCreated.render(mail),
    [],
    null,
    transport,
    executor
  )
}

export async function sendDetailsChanged(
  mail: DetailsChangedMail,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await post(
    'details_changed',
    mail,
    detailsChanged.subject(),
    detailsChanged.render(mail),
    [],
    null,
    transport,
    executor
  )
}

export async function sendPromo(
  mail: PromoMail,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await post('promo', mail, promo.subject(mail), promo.render(mail), [], null, transport, executor)
}

export async function applyDeliveryEvent(event: ResendEvent, tx: PoolClient): Promise<void> {
  const outcome = rules.deliveryOutcomeOf(event.type)
  if (!outcome) return
  const row = await mailers.getByProviderMessageId(event.email_id, tx)
  if (!row) return
  await mailers.applyDelivery(row.id, outcome, event.occurred_at, event.bounce_reason, tx)
}

export async function recordDelivery(event: ResendEvent): Promise<void> {
  await withTransaction((tx) => applyDeliveryEvent(event, tx))
}

export async function sendVoicemailReceived(
  mail: VoicemailReceivedMail,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  await post(
    'voicemail_received',
    mail,
    voicemailReceived.subject(),
    voicemailReceived.render(mail),
    [],
    null,
    transport,
    executor
  )
}

export async function sendSalesOrderToSupplier(
  input: DocumentInput,
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const { order, pricing } = input
  const pdfBuffer = await pdfService.generateInvoice(input)
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
