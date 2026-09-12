import { test, beforeAll, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'

const inPinned = <T>(fn: (c: import('pg').PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] })

import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aHandover } from '#shared/testing/builders/index.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as place from '#orders/place.ts'
import * as orderRules from '#orders/rules.ts'
import * as usersRepo from '#db/users/repo.ts'
import * as creditService from '#transactions/credit/service.ts'
import * as paymentsWebhook from '#transactions/webhook.ts'
import * as sweeps from '#transactions/sweeps.ts'
import * as pricing from '#pricing/index.ts'
import * as emailService from '#documents/emails/service.ts'
import { closeBrowser } from '#documents/pdfs/render/puppeteer.ts'
import { formatSalesOrderNumber } from '#shared/utils/formatOrderNumbers.ts'
import type { Transport } from '#providers/resend/index.ts'

type Message = Parameters<Transport['sendMail']>[0]

function recorder(): Transport & { sent: Message[] } {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (message: Message) => {
      sent.push(message)
      return { messageId: 'recorded', accepted: [message.to] }
    },
  }
}

const NO_SIDE_EFFECTS: typeof place.LIVE = {
  buyLabel: async () => {},
  authorize: async () => {},
  confirm: async () => {},
}

beforeAll(async () => {
  await mockSessions()
})
afterAll(async () => {
  restoreSessions()
  await closeBrowser()
})

async function seedSale(c: PoolClient, status: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('sale', $1, nextval('orders.sale_number_seq'))
     RETURNING id`,
    [status],
    c
  )
  return rows[0]!.id
}

async function seedIntent(
  c: PoolClient,
  provider_ref: string,
  over: {
    status?: string
    cents?: number
    settledCents?: number
    user_id?: string | null
    order_id?: string | null
  } = {}
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (type, status, amount_expected, user_id, order_id)
     VALUES ('order', $1, $2, $3, $4) RETURNING id`,
    [
      over.status ?? 'requires_confirmation',
      (over.cents ?? 5178) / 100,
      over.user_id ?? null,
      over.order_id ?? null,
    ],
    c
  )
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, $3, $4)`,
    [rows[0]!.id, provider_ref, (over.cents ?? 5178) / 100, over.status ?? 'requires_confirmation'],
    c
  )
  if ((over.settledCents ?? 0) > 0) {
    await query(
      `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
       VALUES ($1, $1, $2, 'stripe', $3, now())`,
      [rows[0]!.id, (over.settledCents as number) / 100, provider_ref],
      c
    )
  }
}

async function statusOf(c: PoolClient, id: string) {
  const native = await query<{ status: string }>(
    `SELECT status FROM orders.orders WHERE id = $1`,
    [id],
    c
  )
  return { native: native.rows[0]?.status }
}

test('the flair stamp relabels from anywhere - a label, never a gate (D211: flair)', async () => {
  await inPinned(async (c: PoolClient) => {
    const id = await seedSale(c, 'Pending')
    await ordersRepo.update(id, { status: 'Preparing' }, {}, c)
    assert.deepEqual(await statusOf(c, id), { native: 'Preparing' })

    const relabelled = await seedSale(c, 'Completed')
    await ordersRepo.update(relabelled, { status: 'Preparing' }, {}, c)
    assert.deepEqual(await statusOf(c, relabelled), { native: 'Preparing' })
  })
})

test("a webhook RETRY does not stomp an admin's later label - by payment fact, not status", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, 'Pending')
    const pi = `pi_p9_retry_${Date.now()}`
    await seedIntent(c, pi, { order_id: orderId })

    await paymentsWebhook.applyIntentEvent({
      id: pi,
      status: 'succeeded',
      amount: 5178,
      amount_received: 5178,
    })
    assert.deepEqual(await statusOf(c, orderId), { native: 'Preparing' })

    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c)
    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c)

    await paymentsWebhook.applyIntentEvent({
      id: pi,
      status: 'succeeded',
      amount: 5178,
      amount_received: 5178,
    })
    assert.deepEqual(await statusOf(c, orderId), { native: 'Completed' })
  })
})

test('payment_intent.succeeded advances the order the intent is attached to', async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, 'Pending')
    const pi = `pi_p9_webhook_${Date.now()}`
    await seedIntent(c, pi, { order_id: orderId })

    await paymentsWebhook.applyIntentEvent({
      id: pi,
      status: 'succeeded',
      amount: 5178,
      amount_received: 5178,
    })

    assert.deepEqual(await statusOf(c, orderId), { native: 'Preparing' })
  })
})

test('payment_intent.processing does NOT advance the order', async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, 'Pending')
    const pi = `pi_p9_processing_${Date.now()}`
    await seedIntent(c, pi, { order_id: orderId })

    await paymentsWebhook.applyIntentEvent({
      id: pi,
      status: 'processing',
      amount: 5178,
      amount_received: 0,
    })

    assert.deepEqual(await statusOf(c, orderId), { native: 'Pending' })
  })
})

async function fixtures(c: PoolClient) {
  const { rows: pair } = await query<{ user_id: string; address_id: string }>(
    `SELECT ua.user_id, ua.address_id
       FROM places.user_addresses ua
       JOIN auth.users u ON u.id = ua.user_id
      WHERE NOT EXISTS (SELECT 1 FROM payments.intents i WHERE i.user_id = ua.user_id)
      ORDER BY ua.address_id LIMIT 1`,
    [],
    c
  )
  if (!pair.length) return null
  const { rows: product } = await query<{ id: string }>(
    `SELECT b.id FROM products.bullion b
      WHERE b.display = true LIMIT 1`,
    [],
    c
  )
  if (!product.length) return null
  return { user_id: pair[0]!.user_id, address_id: pair[0]!.address_id, product_id: product[0]!.id }
}

type Fixtures = NonNullable<Awaited<ReturnType<typeof fixtures>>>

async function primeSaleCheckout(c: PoolClient, f: Fixtures): Promise<string> {
  const {
    rows: [co],
  } = await query<{ id: string }>(
    `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'sale')
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`,
    [f.user_id],
    c
  )
  await query(
    `UPDATE checkout.checkouts SET
       recipient_address_id = $2,
       payment_method_id  = (SELECT id FROM payments.methods
                              WHERE direction = 'sale' AND type = 'CARD' LIMIT 1)
     WHERE id = $1`,
    [co!.id, f.address_id],
    c
  )
  const {
    rows: [svc],
  } = await query<{ id: string }>(
    `SELECT id FROM shipping.services WHERE carrier_id IS NULL AND code = 'STANDARD' LIMIT 1`,
    [],
    c
  )
  await aHandover(c, co!.id, {
    direction: 'sale',
    method: 'DROPSHIP',
    choices: { shipment: { carrier_service_id: svc!.id } },
  })
  await query(`UPDATE auth.users SET dorado_funds = 0 WHERE id = $1`, [f.user_id], c)
  await query(
    `DELETE FROM lots.items li USING checkout.lots cl
      WHERE cl.lot_id = li.id AND cl.checkout_id = $1`,
    [co!.id],
    c
  )
  await query(
    `WITH lot AS (
       INSERT INTO lots.items
              (bullion_id, metal_id, pre_melt, post_melt, purity, content_snapshot, unit, quantity)
       SELECT b.id, b.metal_id, b.gross, NULL, b.purity, b.content, 't oz', 1
         FROM products.bullion b WHERE b.id = $2
       RETURNING id
     )
     INSERT INTO checkout.lots (checkout_id, lot_id) SELECT $1, lot.id FROM lot`,
    [co!.id, f.product_id],
    c
  )
  return co!.id
}

async function pricedCents(checkout_id: string) {
  const quote = await pricing.priceCheckout(checkout_id)
  assert.equal(quote.direction, 'sale', 'the fixture primed a sale checkout')
  return Math.round((quote.direction === 'sale' ? quote.post_charges_amount : 0) * 100)
}

const kindOf = (err: unknown) => (err as { kind?: string }).kind

test('an order with a charge refuses to exist without a payment intent', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'the test db has no intent-free user+address+product to price against')
    const checkout_id = await primeSaleCheckout(c, f)
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) =>
        kindOf(e) === 'invalid' && /no open payment intent/.test(String((e as Error).message))
    )
  })
})

test("another customer's intent cannot be named, so the order refuses", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await seedIntent(c, `pi_p9_theirs_${Date.now()}`, { cents: 999999, user_id: null })
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === 'invalid'
    )
  })
})

test('a SETTLED intent already attached to an order refuses a second one', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    const paid = await seedSale(c, 'Pending')
    await seedIntent(c, `pi_p9_attached_${Date.now()}`, {
      status: 'succeeded',
      cents: 999999,
      settledCents: 999999,
      user_id: f.user_id,
      order_id: paid,
    })
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === 'conflict'
    )
    assert.equal(
      (await statusOf(c, paid)).native,
      'Pending',
      'the paid order was touched by the refused retry'
    )
  })
})

test('an unsettled sale is superseded by fact, whatever its label says', async () => {
  await inPinned(async (c: PoolClient) => {
    const id = await seedSale(c, 'Preparing')
    const result = await sweeps.cancelPendingSale(id, c)
    assert.equal(result.order_id, id)
    assert.deepEqual(await statusOf(c, id), { native: 'Cancelled' })
  })
})

test('a paid-but-orderless intent is honoured: the order is created already Preparing', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    const cents = await pricedCents(checkout_id)
    assert.ok(cents > 0, 'the fixture order priced to zero, which defeats this test')
    const pi = `pi_p9_repair_${Date.now()}`
    await seedIntent(c, pi, {
      status: 'succeeded',
      cents,
      settledCents: cents,
      user_id: f.user_id,
    })

    const order = await place.place(checkout_id, NO_SIDE_EFFECTS)
    assert.ok(order, 'no order came back')
    const got = await statusOf(c, order.order.id)
    assert.equal(got.native, 'Preparing', 'a PAID order was born awaiting payment')

    const { rows: attached } = await query<{ order_id: string | null }>(
      `SELECT i.order_id FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [pi],
      c
    )
    assert.equal(attached[0]?.order_id, order.order.id)
  })
})

test('a paid intent at a DIFFERENT price than the cart is refused, naming support', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    const cents = await pricedCents(checkout_id)
    await seedIntent(c, `pi_p9_stale_${Date.now()}`, {
      status: 'succeeded',
      cents: cents + 12345,
      settledCents: cents + 12345,
      user_id: f.user_id,
    })
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === 'conflict' && /support/.test(String((e as Error).message))
    )
  })
})

test('an order fully covered by credit is born Preparing, with no intent attached', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await query(`UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`, [f.user_id], c)

    const order = await place.place(checkout_id, NO_SIDE_EFFECTS)
    assert.ok(order, 'no order came back')
    assert.equal(order.order.status, 'Preparing', 'a fully-paid order was born awaiting payment')
    assert.ok(Number(order.totals?.funds) > 0, "the customer's credit was not applied to the order")
    assert.equal(order.totals?.used_funds, true)
  })
})

test('placing a sale empties the checkout row it came from', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await query(`UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`, [f.user_id], c)
    await place.place(checkout_id, NO_SIDE_EFFECTS)

    const { rows } = await query<{
      recipient_address_id: string | null
      payment_method_id: string | null
    }>(
      `SELECT recipient_address_id, payment_method_id FROM checkout.checkouts WHERE id = $1`,
      [checkout_id],
      c
    )
    assert.equal(rows[0]?.recipient_address_id, null)
    assert.equal(rows[0]?.payment_method_id, null)
  })
})

test('a sale paid entirely by credit sends its confirmation at placement', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await query(`UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`, [f.user_id], c)
    const t = recorder()
    const world: typeof place.LIVE = {
      buyLabel: async () => {},
      authorize: async () => {},
      confirm: (order_id) => emailService.sendOrderPlacedConfirmation(order_id, t),
    }

    const placed = await place.place(checkout_id, world)

    assert.equal(placed.order.status, 'Preparing')
    assert.equal(t.sent.length, 1, 'expected the confirmation to go out at placement')
    const [msg] = t.sent
    assert.match(String(msg.subject), /We've got your order/)
    assert.ok(
      (msg.html ?? '').includes('preparing your order for shipment'),
      'the sale template did not render'
    )
    assert.ok(msg.attachments, 'the confirmation carries no attachments at all')
    assert.equal(msg.attachments.length, 1)
    const [pdf] = msg.attachments
    assert.equal(pdf.filename, `${formatSalesOrderNumber(placed.order.number)}_invoice.pdf`)
  })
})

test('a sale paid by card waits for the webhook before it confirms', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    const cents = await pricedCents(checkout_id)
    assert.ok(cents > 0, 'the fixture order priced to zero, which defeats this test')
    const pi = `pi_p9_confirm_${Date.now()}`
    await seedIntent(c, pi, { cents, user_id: f.user_id })

    const t = recorder()
    const world: typeof place.LIVE = {
      buyLabel: async () => {},
      authorize: async () => {},
      confirm: (order_id) => emailService.sendOrderPlacedConfirmation(order_id, t),
    }

    const placed = await place.place(checkout_id, world)
    assert.equal(placed.order.status, 'Pending')
    assert.equal(t.sent.length, 0, 'the confirmation went out before the card was even charged')

    const webhookWorld: typeof paymentsWebhook.LIVE = {
      retrieve: async () => ({ id: 'unused' }),
      confirm: (order_id) => emailService.sendOrderPlacedConfirmation(order_id, t),
    }
    await paymentsWebhook.applyIntentEvent(
      { id: pi, status: 'succeeded', amount: cents, amount_received: cents },
      undefined,
      webhookWorld
    )

    assert.equal((await statusOf(c, placed.order.id)).native, 'Preparing')
    assert.equal(t.sent.length, 1, 'expected the confirmation once the webhook landed')
    const [msg] = t.sent
    assert.match(String(msg.subject), /We've got your order/)
    assert.ok(
      (msg.html ?? '').includes('preparing your order for shipment'),
      'the sale template did not render'
    )
    assert.ok(msg.attachments, 'the confirmation carries no attachments at all')
    assert.equal(msg.attachments.length, 1)
    const [pdf] = msg.attachments
    assert.equal(pdf.filename, `${formatSalesOrderNumber(placed.order.number)}_invoice.pdf`)
  })
})

test('a balance spent between pricing and placement is refused, not charged twice', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await query(`UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`, [f.user_id], c)

    const quote = await pricing.priceCheckout(checkout_id, c)
    assert.equal(quote.direction, 'sale')
    assert.ok(quote.pre_charges_amount > 0, 'the quote applied no credit, so this proves nothing')

    await query(`UPDATE auth.users SET dorado_funds = 0 WHERE id = $1`, [f.user_id], c)

    const locked = await usersRepo.balanceForUpdate(f.user_id, c)
    assert.throws(
      () => orderRules.assertCreditCovers(locked, quote.pre_charges_amount),
      (err: unknown) => kindOf(err) === 'conflict' && /no longer covers/.test(String(err)),
      'the placement would have charged a balance that is no longer there'
    )

    await assert.rejects(
      () => creditService.removeFunds(f.user_id, quote.pre_charges_amount, c),
      /cannot go below zero/,
      'the second guard would have let the balance go negative'
    )
    const after = await usersRepo.balanceForUpdate(f.user_id, c)
    assert.equal(Number(after ?? 0), 0, 'the refused placement still moved the balance')
  })
})

test('the credit a sale applies is held against the order, not spent into thin air', async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c)
    assert.ok(f, 'no fixtures')
    const checkout_id = await primeSaleCheckout(c, f)
    await query(`UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`, [f.user_id], c)

    const order = await place.place(checkout_id, NO_SIDE_EFFECTS)
    assert.ok(order, 'no order came back')

    const { rows } = await query<{ type: string; amount: number }>(
      `SELECT type, amount FROM payments.ledger WHERE order_id = $1`,
      [order.order.id],
      c
    )
    assert.equal(rows.length, 1, 'the credit moved with nothing recording why (finding 28)')
    assert.equal(
      rows[0]!.type,
      'Debit',
      'an order that settled at placement still holds its credit in reserve'
    )
    assert.equal(Number(rows[0]!.amount), Number(order.totals?.funds))
  })
})
