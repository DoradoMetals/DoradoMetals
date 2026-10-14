import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aPaymentIntent, aPayout, aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as repo from '#db/media/pdfs/repo.ts'
import { timedEnd } from '#shared/text/time.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

const anOrderId = async (c: PoolClient) =>
  (await anOrder(c, await aUser(c), { direction: 'purchase' })).id

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

test('create writes a row and returns its id', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'packing_list',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/packing_list-test.pdf`,
        size_bytes: 42,
        checksum: 'deadbeef',
      },
      c
    )
    assert.ok(written.id)
  })
})

test('latestOfKind reads back a row this transaction just wrote', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'invoice',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/invoice-1.pdf`,
        size_bytes: 20,
        checksum: 'new-checksum',
      },
      c
    )

    const latest = await repo.latestOfKind('invoice', orderId, c)
    assert.equal(latest?.id, written.id)
    assert.equal(latest?.checksum, 'new-checksum')
  })
})

test('latestOfKind answers null for an order with no document at all', async () => {
  await inRollback(async (c) => {
    const latest = await repo.latestOfKind('invoice', await anOrderId(c), c)
    assert.equal(latest, null)
  })
})

test('parties answers no office, appointment or pickup for an order with no fulfilment', async () => {
  await inRollback(async (c) => {
    const parties = await repo.parties(await anOrderId(c), c)
    assert.ok(parties)
    assert.equal(parties.office, null)
    assert.equal(parties.appointment, null)
    assert.equal(parties.pickup, null)
    assert.equal(parties.card, null)
  })
})

const aFulfilment = async (c: PoolClient, order_id: string): Promise<string> => {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO fulfillments.fulfillments (method_id, order_id)
     SELECT id, $1 FROM fulfillments.methods ORDER BY id LIMIT 1
     RETURNING id`,
    [order_id]
  )
  return rows[0]!.id
}

test('parties names the office, the slot and the host of an appointment', async () => {
  await inRollback(async (c) => {
    const order_id = await anOrderId(c)
    const fulfillment_id = await aFulfilment(c, order_id)
    await c.query(
      `INSERT INTO fulfillments.directs
         (fulfillment_id, location_id, assigned_employee_id, is_appointment, start_time)
       SELECT $1, (SELECT id FROM places.locations ORDER BY id LIMIT 1),
              (SELECT id FROM auth.employees ORDER BY id LIMIT 1), true,
              '2026-09-09T15:30:00Z'`,
      [fulfillment_id]
    )
    const parties = await repo.parties(order_id, c)
    assert.ok(parties?.office && parties.appointment)
    assert.equal(parties.office.label, 'OFFICE')
    assert.equal(timedEnd(parties.appointment, '2026-10-14').who, 'Sep 9, 10:30 AM')
    assert.ok(parties.appointment.lines.every((line) => line.startsWith('With ')))
    assert.equal(parties.pickup, null)
  })
})

test('parties prints a pickup window in Central time with its driver', async () => {
  await inRollback(async (c) => {
    const order_id = await anOrderId(c)
    const fulfillment_id = await aFulfilment(c, order_id)
    await c.query(
      `INSERT INTO fulfillments.pickups (fulfillment_id, start_time, end_time)
       VALUES ($1, '2026-09-09T18:00:00Z', '2026-09-09T20:00:00Z')`,
      [fulfillment_id]
    )
    const parties = await repo.parties(order_id, c)
    assert.equal(timedEnd(parties!.pickup!, '2026-10-14').who, 'Sep 9, 1:00 – 3:00 PM')
    assert.deepEqual(parties?.pickup?.lines, [])
  })
})

test('parties names the card and says paid only once the intent succeeded', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'sale' })
    const { rows } = await c.query<{ id: string; method_id: string }>(
      `INSERT INTO payments.details (user_id, method_id, last_four, card_brand)
       SELECT $1, id, '4242', 'visa' FROM payments.methods
        WHERE direction = 'sale' AND type = 'CARD'
       RETURNING id, method_id`,
      [user.id]
    )
    const pending = await aPaymentIntent(c, user, {
      order,
      details_id: rows[0]!.id,
      method_id: rows[0]!.method_id,
      status: 'processing',
    })
    const before = await repo.parties(order.id, c)
    assert.equal(before?.card?.who, 'Visa ••••4242')
    assert.deepEqual(before?.payment?.lines, [], 'an unsettled intent was called paid')

    await c.query(`UPDATE payments.intents SET status = 'succeeded' WHERE id = $1`, [pending.id])
    const after = await repo.parties(order.id, c)
    assert.deepEqual(after?.payment?.lines, ['Paid in full'])
  })
})

test('parties prints no card and no payment for a sale with no intent', async () => {
  await inRollback(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'sale' })
    const parties = await repo.parties(order.id, c)
    assert.equal(parties?.card, null)
    assert.equal(parties?.payment, null)
  })
})

test('parties reads the payout method label and its time from the method row', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
    await aPayout(c, user, { method: 'ECHECK', order })
    const parties = await repo.parties(order.id, c)
    const { rows } = await c.query<{ label: string; time_delay: string | null }>(
      `SELECT label, time_delay FROM payments.methods WHERE type = 'ECHECK' AND direction = 'purchase'`
    )
    assert.equal(parties?.payout?.who, rows[0]!.label)
    assert.deepEqual(parties?.payout?.lines, rows[0]!.time_delay ? [rows[0]!.time_delay] : [])
  })
})

test('parties answers null for an order that does not exist', async () => {
  await inRollback(async (c) => {
    assert.equal(await repo.parties('00000000-0000-4000-8000-000000000000', c), null)
  })
})

test('rateSheet parses with a Bullion and a Scrap row per metal', async () => {
  await inRollback(async (c) => {
    const doc = await repo.rateSheet(c)
    const { rows } = await c.query<{ label: string }>(
      `SELECT label FROM payments.methods
        WHERE direction = 'purchase' AND enabled AND display ORDER BY sort_order`
    )
    assert.deepEqual(
      doc.fees.map((fee) => fee.label),
      rows.map((row) => row.label),
      'the payout lines do not come from the method rows'
    )
    assert.ok(doc.metals.length >= 1)
    for (const metal of doc.metals) {
      assert.deepEqual(
        metal.rows.map((r) => r.label),
        ['Bullion', 'Scrap']
      )
      for (const row of metal.rows) {
        assert.equal(row.values.length, metal.columns.length)
      }
    }
  })
})

test('the audit trigger stamps who uploaded a pdf', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const actor = await aUser(c)
    await c.query(`SELECT set_config('app.actor_id', $1, true)`, [actor.id])

    const written = await repo.create(
      {
        kind: 'intake_receipt',
        order_id: orderId,
        refining_order_id: null,
        path: 'pdfs/audit-stamp-check.pdf',
        size_bytes: 10,
        checksum: 'audit-stamp-check',
      },
      c
    )
    const { rows } = await c.query<{ created_by_id: string | null }>(
      `SELECT created_by_id FROM media.pdfs WHERE id = $1`,
      [written.id]
    )
    assert.equal(
      rows[0]!.created_by_id,
      actor.id,
      'media.pdfs carried the audit trigger with nowhere for it to write'
    )
  })
})
