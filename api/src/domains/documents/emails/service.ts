import * as pdfService from '#documents/pdfs/service.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import type { PurchaseDocument, SalesDocument } from '#documents/pdfs/service.ts'
import type { Attachment, Transport } from '#providers/emails/nodemailer.ts'

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
import {
  renderSalesOrderToSupplierEmail,
  renderVerifyEmail,
} from '#documents/emails/utils/renderEmail.ts'
import { requiredEnv } from '#shared/env/required.ts'

import { deliver } from '#providers/emails/nodemailer.ts'
import * as rules from '#documents/emails/rules.ts'
import { recordEmail } from '#documents/emails/record.ts'
import type { EmailKind } from '#documents/emails/record.ts'
import { persistPdf } from '#documents/pdfs/store.ts'
import { attempt } from '#shared/attempt.ts'
import type { PoolClient } from 'pg'
import type {
  AccountCreatedMail,
  DetailsChangedMail,
  EmailRecipient,
  MailerAddressee,
  SignInCodeMail,
} from '@dorado/contracts'
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '#shared/utils/formatOrderNumbers.ts'

// One send, one row. The row is filed BEFORE the failure travels on, so a
// failure is a row too - and the trail is what makes a scheduled mailer
// idempotent. Every mailer of the Figma "Media" page goes out through here.
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
  const delivery = await deliver({ to: to.email, subject, html, attachments }, transport)
  await recordEmail(
    { kind, to: to.email, subject, order_id: to.order_id, pdf_id, user_id: to.user_id },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}

// A mailer that reports a MOMENT - a parcel scanned, a driver gone, a payout
// paid - goes out once per order. The trail is what remembers: no flag column,
// no in-memory set, nothing to get out of step with the rows. A trigger may
// therefore be called as often as its caller likes.
async function sentAlready(
  kind: EmailKind,
  order_id: string,
  executor?: PoolClient
): Promise<boolean> {
  return await mailers.hasSent(order_id, [kind], executor)
}

// ---------------------------------------------------------------------------
// Order received (6:173) - replaces purchase_order_created AND
// sales_order_created. One mailer, two kinds: the kind is what says which side
// of the business the row belongs to.
// ---------------------------------------------------------------------------

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

  // A buyer ships nothing. The packing list is purchase-shaped throughout - it
  // says "put this in your package" and embeds an inbound label a sale does not
  // have - so a sale's confirmation carries its own invoice instead.
  const isSale = mail.direction === 'sale'
  const input = await inputs.packingListInputs(order_id, executor)
  const bytes = isSale
    ? await pdfService.generateSalesOrderInvoice(input)
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

// ---------------------------------------------------------------------------
// Document sent (214:904) - the mailer that carries a PDF. Every document an
// admin sends from an order goes out under this shell; the priced invoice keeps
// its own kind, so the trail it has been writing since 090 stays continuous.
// ---------------------------------------------------------------------------

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
  input: PurchaseDocument,
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

// ---------------------------------------------------------------------------
// Logistics (154:808, 154:881, 211:659, 211:704, 211:747, 211:790)
// ---------------------------------------------------------------------------

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

// The daily reminder. WHICH appointments are due is a SQL question, and the
// answer already excludes every order the trail says has been reminded - so the
// job is a loop and nothing else, and running it twice on the same day sends
// nothing the second time.
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

// ---------------------------------------------------------------------------
// Payout sent (6:260) - the customer has been paid.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FOR THE PASSWORDLESS-AUTH LANE.
//
// These three take a CONTRACT rather than a bag of arguments, so zod has
// already said the shape is right by the time one reaches here:
//
//   sendSignInCode({ order_id: null, user_id, email, name, code,
//                    expires_in_minutes })      -> kind `sign_in_code`
//   sendAccountCreated({ order_id: null, user_id, email, name, url })
//                                               -> kind `account_created`
//   sendDetailsChanged({ order_id: null, user_id, email, name, changed,
//                        changed_at, rows })    -> kind `details_changed`
//
// `changed` names the field in words ("Email address"), `changed_at` is already
// formatted for a reader ("Sep 3 at 4:18 PM CT"). Build the card's rows with
// `rules.detailsChangedRows(changed, previous, next)`, which MASKS both values -
// never pass a raw address or number into a row yourself.
//
// All three throw if the transport refuses, AFTER the trail row is written, the
// same as every other sender. Pass a transport in tests: nothing in a test run
// may reach a real mailbox.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Not in the Figma page, and staying
// ---------------------------------------------------------------------------

// The refiner's copy of a sales order. It goes to a SUPPLIER, not a customer,
// so it is not one of the customer mailers and keeps its own template.
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

// better-auth's verification callback. A SIGN-UP gets the Account created
// mailer from the design now; the plain verify link keeps the old template
// until the passwordless-auth lane deletes both it and this function.
export async function sendAuthVerificationEmail(
  user: EmailRecipient,
  url: string,
  isSignUp: boolean,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  const user_id = typeof user.id === 'string' ? user.id : null
  if (isSignUp) {
    await sendAccountCreated(
      { order_id: null, user_id, email: user.email, name: user.name ?? null, url },
      transport,
      executor
    )
    return
  }

  const subject = 'Verify Your Email Address'
  const delivery = await deliver(
    {
      to: user.email,
      subject,
      text: `Click the link to verify your email: ${url}`,
      html: renderVerifyEmail({ firstName: String(user.name ?? ''), url }),
    },
    transport
  )

  await recordEmail(
    { kind: 'auth_verification', to: user.email, subject, user_id },
    rules.outcomeOf(delivery),
    executor
  )
  rules.assertDelivered(delivery)
}
