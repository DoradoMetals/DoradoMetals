import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Email } from '@dorado/contracts'
import type {
  DocumentSentMail,
  OrderReceivedMail,
  PayoutSentMail,
  ScheduleMail,
  ShipmentMail,
} from '@dorado/contracts'
import {
  DocumentSentMail as DocumentSent,
  OrderReceivedMail as OrderReceived,
  PayoutSentMail as PayoutSent,
  ScheduleMail as Schedule,
  ShipmentMail as ShipmentContent,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export type NewEmail = {
  kind: Email['kind']
  status: Email['status']
  to_address: string
  subject: string | null
  order_id: string | null
  user_id?: string | null
  pdf_id?: string | null
  provider_message_id?: string | null
  error?: string | null
}

export async function hasSent(
  order_id: string,
  kinds: readonly Email['kind'][],
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql('has_sent'), [order_id, kinds], executor)
  return rows[0]?.present === true
}

export async function create(row: NewEmail, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql('create'),
    [
      row.kind,
      row.status,
      row.to_address,
      row.subject,
      row.order_id,
      row.user_id,
      row.pdf_id,
      row.provider_message_id,
      row.error,
    ],
    executor
  )
  return rows[0]
}

// One read per mailer. Each returns a single jsonb object - the addressee, the
// order it belongs to and the summary card's rows already assembled - which its
// own contract parses. Nothing is stitched afterwards (ruling 78): a row of the
// card is a row of the read.
async function contentOf(name: string, key: string, executor?: Executor): Promise<unknown> {
  const { rows } = await query<{ content: unknown }>(sql(name), [key], executor)
  return rows[0]?.content
}

export async function orderReceived(
  order_id: string,
  executor?: Executor
): Promise<OrderReceivedMail | null> {
  const row = await contentOf('content_order_received', order_id, executor)
  return row === undefined ? null : OrderReceived.parse(row)
}

export async function payoutSent(
  order_id: string,
  executor?: Executor
): Promise<PayoutSentMail | null> {
  const row = await contentOf('content_payout_sent', order_id, executor)
  return row === undefined ? null : PayoutSent.parse(row)
}

export async function shipmentSent(
  order_id: string,
  executor?: Executor
): Promise<ShipmentMail | null> {
  const row = await contentOf('content_shipment_sent', order_id, executor)
  return row === undefined ? null : ShipmentContent.parse(row)
}

export async function shipmentReceived(
  order_id: string,
  executor?: Executor
): Promise<ShipmentMail | null> {
  const row = await contentOf('content_shipment_received', order_id, executor)
  return row === undefined ? null : ShipmentContent.parse(row)
}

export async function pickupBooked(
  order_id: string,
  executor?: Executor
): Promise<ScheduleMail | null> {
  const row = await contentOf('content_pickup_booked', order_id, executor)
  return row === undefined ? null : Schedule.parse(row)
}

export async function pickupComplete(
  order_id: string,
  executor?: Executor
): Promise<ScheduleMail | null> {
  const row = await contentOf('content_pickup_complete', order_id, executor)
  return row === undefined ? null : Schedule.parse(row)
}

export async function appointmentBooked(
  order_id: string,
  executor?: Executor
): Promise<ScheduleMail | null> {
  const row = await contentOf('content_appointment_booked', order_id, executor)
  return row === undefined ? null : Schedule.parse(row)
}

export async function appointmentTomorrow(
  order_id: string,
  executor?: Executor
): Promise<ScheduleMail | null> {
  const row = await contentOf('content_appointment_tomorrow', order_id, executor)
  return row === undefined ? null : Schedule.parse(row)
}

export async function documentSent(
  order_id: string,
  label: string,
  size_bytes: number,
  executor?: Executor
): Promise<DocumentSentMail | null> {
  const { rows } = await query<{ content: unknown }>(
    sql('content_document_sent'),
    [order_id, label, size_bytes],
    executor
  )
  const row = rows[0]?.content
  return row === undefined ? null : DocumentSent.parse(row)
}

// Tomorrow's appointments that have not been reminded yet. The trail is the
// idempotency - see the SQL.
export async function appointmentsDueTomorrow(executor?: Executor): Promise<string[]> {
  const { rows } = await query<{ order_id: string }>(sql('appointments_tomorrow'), [], executor)
  return rows.map((row) => row.order_id)
}
