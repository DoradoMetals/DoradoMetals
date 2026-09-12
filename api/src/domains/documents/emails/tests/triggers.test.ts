import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aShipment, fulfillmentMethodId } from '#shared/testing/builders/index.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import * as pickupsRepo from '#db/fulfillments/pickups/repo.ts'
import * as directsRepo from '#db/fulfillments/directs/repo.ts'
import * as shipmentsRepo from '#db/shipping/shipments/repo.ts'
import * as emails from '#documents/emails/service.ts'
import type { Transport } from '#providers/communications/email/index.ts'

type Message = Parameters<Transport['sendMail']>[0]

afterAll(async () => {
  await pool.end()
})

const LOCK = [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS]

function recorder(): Transport & { sent: Message[] } {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (message: Message) => {
      sent.push(message)
      return { messageId: '<recorded@test>' }
    },
  }
}

const trail = async (c: PoolClient, order_id: string, kind: string) => {
  const { rows } = await query<{ status: string; to_address: string; subject: string }>(
    `SELECT status, to_address, subject FROM media.emails WHERE order_id = $1 AND kind = $2::media.email_kind`,
    [order_id, kind],
    c
  )
  return rows
}

// A booking of the given category, attached to the order. The mailers read the
// booking rather than being told about it, so the test has to write one.
async function aBooking(
  c: PoolClient,
  order_id: string,
  type: string,
  starts_at: string,
  is_appointment = false
): Promise<string> {
  const method_id = await fulfillmentMethodId(c, type, 'purchase')
  const made = await fulfillments.create(order_id, method_id, 'PENDING', c)
  assert.ok(made?.id, 'no fulfillment was created')
  if (type === 'PICKUP') {
    await pickupsRepo.create({ fulfillment_id: made.id, start_time: starts_at }, c)
  } else {
    await directsRepo.create({ fulfillment_id: made.id, start_time: starts_at, is_appointment }, c)
  }
  return made.id
}

// Tomorrow, in the office's own time zone - the reminder's window is a Chicago
// calendar day, so a UTC "tomorrow" is the wrong question to ask.
async function tomorrowAtNoon(c: PoolClient): Promise<string> {
  const { rows } = await query<{ at: string }>(
    `SELECT (((now() AT TIME ZONE 'America/Chicago')::date + 1) + time '12:00')
              AT TIME ZONE 'America/Chicago' AS at`,
    [],
    c
  )
  return new Date(rows[0].at).toISOString()
}

test('the pickup booked mailer sends once and files one row', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      await aBooking(c, order.id, 'PICKUP', await tomorrowAtNoon(c))

      const t = recorder()
      await emails.sendPickupBooked(order.id, t, c)
      await emails.sendPickupBooked(order.id, t, c)

      assert.equal(t.sent.length, 1, 'a second call sent the customer a duplicate')
      assert.equal(t.sent[0].to, user.email, 'the mailer went to the wrong address')
      assert.match(String(t.sent[0].subject), /Your pickup is booked/)
      const rows = await trail(c, order.id, 'pickup_booked')
      assert.equal(rows.length, 1, 'the send left no row, or left two')
      assert.equal(rows[0].status, 'sent')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the pickup complete mailer prints the collection and files its row', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(2)
      await aBooking(c, order.id, 'PICKUP', await tomorrowAtNoon(c))

      const t = recorder()
      await emails.sendPickupComplete(order.id, t, c)

      assert.equal(t.sent.length, 1, 'nothing was sent')
      assert.ok((t.sent[0].html ?? '').includes('We have your metals'), 'the wrong mailer went out')
      assert.ok((t.sent[0].html ?? '').includes('2 of 2'), 'the item count is wrong')
      assert.equal((await trail(c, order.id, 'pickup_complete')).length, 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('an appointment sends the booking mailer; a walk-in sends nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const booked = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      await aBooking(c, booked.id, 'APPOINTMENT', await tomorrowAtNoon(c), true)

      const walkIn = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      await aBooking(c, walkIn.id, 'WALK IN', await tomorrowAtNoon(c), false)

      const t = recorder()
      await emails.sendAppointmentBooked(booked.id, t, c)
      await emails.sendAppointmentBooked(walkIn.id, t, c)

      assert.equal(t.sent.length, 1, 'a walk-in was told it had an appointment')
      assert.match(String(t.sent[0].subject), /You're booked/)
      assert.equal((await trail(c, booked.id, 'appointment_booked')).length, 1)
      assert.equal((await trail(c, walkIn.id, 'appointment_booked')).length, 0)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the reminder job is idempotent: the trail is what remembers', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      await aBooking(c, order.id, 'APPOINTMENT', await tomorrowAtNoon(c), true)

      const t = recorder()
      const first = await emails.sendTomorrowsReminders(t, c)
      assert.ok(first >= 1, 'the job found no appointment due tomorrow')
      const afterFirstRun = t.sent.length
      assert.ok(afterFirstRun >= 1, 'the job sent nothing')

      const second = await emails.sendTomorrowsReminders(t, c)
      assert.equal(second, 0, 'the second run still considered the same appointment due')
      assert.equal(
        t.sent.length,
        afterFirstRun,
        'THE SECOND RUN SENT AGAIN - the reminder is not idempotent'
      )
      assert.equal(
        (await trail(c, order.id, 'appointment_tomorrow')).length,
        1,
        'the reminder filed two rows for one appointment'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('a parcel with only a label sends nothing; a scanned one sends once', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      const shipment = await aShipment(c, { id: order.id, direction: 'purchase' })

      const t = recorder()
      await emails.sendShipmentSent(order.id, t, c)
      assert.equal(t.sent.length, 0, 'a customer was told a parcel had moved before it was scanned')

      await shipmentsRepo.update(shipment.id, { shipping_status: 'In transit' }, c)
      await emails.sendShipmentSent(order.id, t, c)
      await emails.sendShipmentSent(order.id, t, c)

      assert.equal(t.sent.length, 1, 'the scan mailer went out twice')
      assert.match(String(t.sent[0].subject), /Your metals are on the move/)
      assert.ok(
        (t.sent[0].html ?? '').includes(shipment.tracking_number),
        'the tracking number is missing from the card'
      )
      assert.equal((await trail(c, order.id, 'shipment_sent')).length, 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the arrival mailer waits for a delivered scan', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      const shipment = await aShipment(c, { id: order.id, direction: 'purchase' })

      const t = recorder()
      await emails.sendShipmentReceived(order.id, t, c)
      assert.equal(t.sent.length, 0, 'a customer was told an undelivered parcel had arrived')

      await shipmentsRepo.update(
        shipment.id,
        { delivered_at: new Date().toISOString(), shipping_status: 'Delivered' },
        c
      )
      await emails.sendShipmentReceived(order.id, t, c)

      assert.equal(t.sent.length, 1, 'the arrival went unannounced')
      assert.match(String(t.sent[0].subject), /Your metals arrived/)
      assert.ok((t.sent[0].html ?? '').includes('1 of 1'), 'the parcel count is wrong')
      assert.equal((await trail(c, order.id, 'shipment_received')).length, 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the payout mailer prints what was paid and files a payout_sent row', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withTotals({ total: 12480.36, base_total: 12730.36, payout_fee: 250 })

      const t = recorder()
      await emails.sendPayoutSent(order.id, t, c)
      await emails.sendPayoutSent(order.id, t, c)

      assert.equal(t.sent.length, 1, 'the customer was told twice they had been paid')
      const html = t.sent[0].html ?? ''
      assert.ok(html.includes('$12,480.36'), 'the amount paid is missing')
      assert.ok(html.includes('$12,730.36'), 'the metal value is missing')
      assert.ok(html.includes('-$250.00'), 'the fee is not shown as a deduction')
      assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'a figure did not resolve')
      assert.equal((await trail(c, order.id, 'payout_sent')).length, 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the document mailer carries the bytes it announces', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
      const bytes = Buffer.from('%PDF-1.4 pretend document')

      const t = recorder()
      await emails.sendDocument(order.id, 'Packing List', bytes, null, 'document_sent', t, c)

      assert.equal(t.sent.length, 1, 'nothing was sent')
      assert.ok((t.sent[0].html ?? '').includes('Your packing list is ready'))
      assert.equal(t.sent[0].attachments?.length, 1, 'the document did not travel with the mailer')
      assert.equal(t.sent[0].attachments?.[0].filename, 'packing_list.pdf')
      assert.equal((await trail(c, order.id, 'document_sent')).length, 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})
