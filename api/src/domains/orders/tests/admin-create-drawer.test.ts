import { test, afterAll, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aProduct,
  aUser,
  anAddress,
  fulfillmentMethodId,
  paymentMethodId,
  saleServiceId,
} from '#shared/testing/builders/index.ts'
import * as moovFake from '#providers/moov/fake.ts'
import * as plaidFake from '#providers/plaid/fake.ts'
import * as banks from '#transactions/banks/service.ts'
import * as pricing from '#pricing/index.ts'
import { retierPremiums } from '#orders/service.ts'
import { closeBrowser } from '#documents/pdfs/render/puppeteer.ts'
import { AdminLot, AdminOrderCreate, AdminPayout } from '@dorado/contracts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'

await mockSessions()
const { default: app } = await import('#app')

beforeEach(() => {
  moovFake.reset()
  plaidFake.reset()
})

afterAll(async () => {
  restoreSessions()
  await closeBrowser()
  await pool.end()
})

const admin = { ...TEST_ACTOR, role: 'admin' }
const LOCK = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS]

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCK })

const scrap = { metal_id: 'Gold', pre_melt: 10, purity: 0.5, unit: 't oz' }

const pickupChoices = (pickup_address_id: string) => ({
  pickup: { pickup_address_id, start_time: '2026-10-01T15:00:00.000Z' },
})

async function verifiedLink(user_id: string) {
  return await banks.linkFromPlaid(user_id, {
    public_token: 'public-sandbox-drawer',
    account_id: 'plaid-acct-drawer',
    rail: 'ACH',
  })
}

const placeAsAdmin = (body: unknown) =>
  as(admin, () =>
    request(app)
      .post('/api/orders/admin')
      .send(body as object)
  )

test('the admin lot shape is the checkout lot plus an optional premium (ruling 158)', () => {
  assert.equal(AdminLot.safeParse({ ...scrap, premium: 0.8 }).success, true)
  assert.equal(AdminLot.safeParse({ ...scrap }).success, true)
  assert.equal(
    AdminLot.safeParse({
      bullion_id: '00000000-0000-4000-8000-000000000001',
      quantity: 2,
      premium: 1.04,
    }).success,
    true
  )
  assert.equal(AdminLot.safeParse({ ...scrap, premium: -0.1 }).success, false, 'a negative premium')
  assert.equal(AdminLot.safeParse({ ...scrap, price: 10 }).success, false, 'a price is never sent')
})

test('a purchase lot sent with a premium keeps it on the lot and in the priced order', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const address = await anAddress(c, customer)
    const link = await verifiedLink(customer.id)
    const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')

    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap, premium: 0.5 }, { ...scrap }],
      fulfillment: { method_id, choices: pickupChoices(address.id) },
      payout: { method: 'ACH', bank_link_id: link.id },
    })

    assert.equal(placed.status, 201, placed.text)
    const premiums = placed.body.lots.map((row: { lot: { premium: number | null } }) =>
      row.lot.premium === null ? null : Number(row.lot.premium)
    )
    assert.ok(premiums.includes(0.5), `the override never reached the lot: ${premiums}`)
    const rated = premiums.find((p: number | null) => p !== 0.5)
    assert.ok(rated !== null && rated !== undefined && rated > 0, 'the absent premium is the rate')

    const priced = await pricing.priceOrder(placed.body.order.id)
    assert.ok(
      priced.items.some((line) => Number(line.premium) === 0.5),
      'retiering overwrote the admin override'
    )
  })
})

test('a sale lot sent with a premium is sold at that premium', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c, { funds: 1_000_000 })
    const address = await anAddress(c, customer)
    const product = await aProduct(c, { metal_id: 'Gold', content: 0.001, ask_premium: 1 })
    const credit = await paymentMethodId(c, 'CREDIT', 'sale')
    const method_id = await fulfillmentMethodId(c, 'DROPSHIP', 'sale')
    const carrier_service_id = await saleServiceId(c)

    const placed = await placeAsAdmin({
      direction: 'sale',
      user_id: customer.id,
      lots: [{ bullion_id: product.id, quantity: 2, premium: 1.05 }],
      fulfillment: { method_id, choices: { shipment: { carrier_service_id } } },
      payment_method_id: credit,
      recipient_address_id: address.id,
    })

    assert.equal(placed.status, 201, placed.text)
    assert.equal(Number(placed.body.lots[0].lot.premium), 1.05)
  })
})

test('customer checkout still refuses a premium on a lot', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const res = await as({ ...customer, role: 'user' }, () =>
      request(app)
        .put('/api/checkout/lots')
        .query({ direction: 'purchase' })
        .send({ lots: [{ ...scrap, premium: 0.9 }] })
    )
    assert.equal(res.status, 400, res.text)
    assert.match(res.body?.error?.message ?? '', /premium/)
  })
})

test('the purchase payout names a linked bank account by id and never takes numbers (ruling 160)', async () => {
  assert.equal(AdminPayout.safeParse({ method: 'ACH', bank_link_id: TEST_ACTOR.id }).success, true)
  assert.equal(AdminPayout.safeParse({ method: 'ECHECK' }).success, true)
  assert.equal(AdminPayout.safeParse({ method: 'DORADO_ACCOUNT' }).success, true)
  assert.equal(
    AdminPayout.safeParse({ method: 'ACH', routing_number: '021000021', account_number: '1' })
      .success,
    false
  )

  await inOrders(async (c) => {
    const customer = await aUser(c)
    const address = await anAddress(c, customer)
    const link = await verifiedLink(customer.id)
    const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')

    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }],
      fulfillment: { method_id, choices: pickupChoices(address.id) },
      payout: { method: 'ACH', bank_link_id: link.id },
    })
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.payout?.method, 'ACH')
    assert.equal(placed.body.payout?.account_last4, link.last_four)
    assert.equal(/routing|account_number/.test(JSON.stringify(placed.body)), false)

    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payments.details
        WHERE user_id = $1 AND (routing_number_encrypted IS NOT NULL OR routing_number IS NOT NULL)`,
      [customer.id],
      c
    )
    assert.equal(rows[0]?.n, 0, 'a linked-account payout wrote bank numbers')

    const numbers = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }],
      fulfillment: { method_id, choices: pickupChoices(address.id) },
      payout: {
        method: 'ACH',
        account_holder_name: 'Typed By Staff',
        routing_number: '021000021',
        account_number: '000123456789',
      },
    })
    assert.equal(numbers.status, 400, numbers.text)
  })
})

test("a payout to a pending or another customer's account is refused", async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const stranger = await aUser(c)
    const address = await anAddress(c, customer)
    const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')
    const pending = await banks.linkByMicroDeposits(customer.id, {
      holder_name: 'Pending Holder',
      account_type: 'checking',
      routing_number: '021000021',
      account_number: '000123456789',
      rail: 'ACH',
    })
    const theirs = await verifiedLink(stranger.id)

    const base = {
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }],
      fulfillment: { method_id, choices: pickupChoices(address.id) },
    }
    const unverified = await placeAsAdmin({
      ...base,
      payout: { method: 'ACH', bank_link_id: pending.id },
    })
    assert.equal(unverified.status, 422, unverified.text)
    assert.match(unverified.body?.error?.message ?? '', /verified/i)

    const foreign = await placeAsAdmin({
      ...base,
      payout: { method: 'ACH', bank_link_id: theirs.id },
    })
    assert.ok([403, 422].includes(foreign.status), foreign.text)
  })
})

test('an eCheck payout goes to the email on file and a Dorado balance payout needs no account', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const address = await anAddress(c, customer)
    const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')
    const base = {
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }],
      fulfillment: { method_id, choices: pickupChoices(address.id) },
    }

    const echeck = await placeAsAdmin({ ...base, payout: { method: 'ECHECK' } })
    assert.equal(echeck.status, 201, echeck.text)
    assert.equal(echeck.body.payout?.method, 'ECHECK')

    const balance = await placeAsAdmin({ ...base, payout: { method: 'DORADO_ACCOUNT' } })
    assert.equal(balance.status, 201, balance.text)
    assert.equal(balance.body.payout?.method, 'DORADO_ACCOUNT')
  })
})

test('an order with no lots may leave fulfillment and payout for later', async () => {
  const empty = { direction: 'purchase', user_id: TEST_ACTOR.id, lots: [] }
  assert.equal(AdminOrderCreate.safeParse(empty).success, true, 'Decide later is a body shape')

  await inOrders(async (c) => {
    const customer = await aUser(c)
    const placed = await placeAsAdmin({ ...empty, user_id: customer.id })
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.order.user_id, customer.id)
    assert.equal(placed.body.lots.length, 0)

    const sale = await placeAsAdmin({ direction: 'sale', user_id: customer.id, lots: [] })
    assert.equal(sale.status, 201, sale.text)
    assert.equal(sale.body.order.direction, 'sale')
  })
})

test('a purchase with lots may leave fulfillment and payout for the order screen (ruling 163)', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }, { ...scrap, premium: 0.8 }],
    })
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.order.user_id, customer.id)
    assert.equal(placed.body.lots.length, 2, 'the lots are linked to the bare order')
    assert.equal(placed.body.fulfillment ?? null, null, 'no fulfillment was chosen')
    const premiums = (placed.body.lots as { lot: { premium: number | null } }[]).map(
      (row) => row.lot.premium
    )
    assert.ok(premiums.includes(0.8), 'the premium override rides onto its lot')

    await retierPremiums(placed.body.order.id, c)
    const kept = await c.query(
      `SELECT li.premium, li.premium_override
         FROM orders.lots ol JOIN inventory.lots li ON li.id = ol.lot_id
        WHERE ol.order_id = $1 AND li.premium_override`,
      [placed.body.order.id]
    )
    assert.equal(kept.rows.length, 1, 'the override is flagged as one')
    assert.equal(Number(kept.rows[0].premium), 0.8, 'a retier keeps the admin override')

    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM orders.lots WHERE order_id = $1`,
      [placed.body.order.id]
    )
    assert.equal(rows[0].n, 2)
  })
})

test('a failing stamp rolls the whole order back, so a retry cannot double it', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const failed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      assigned_to_id: '00000000-0000-4000-8000-00000000dead',
      notes: 'stamped in the same transaction',
      lots: [{ ...scrap }],
    })
    assert.ok(failed.status >= 400, failed.text)
    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM orders.orders WHERE user_id = $1`,
      [customer.id]
    )
    assert.equal(rows[0].n, 0, 'the order was committed without its stamp')
  })
})

test('a sale with lots still names its fulfillment and payment at creation', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const undecided = await placeAsAdmin({
      direction: 'sale',
      user_id: customer.id,
      lots: [
        { bullion_id: (await aProduct(c, { metal_id: 'Gold', content: 0.001 })).id, quantity: 1 },
      ],
    })
    assert.equal(undecided.status, 422, undecided.text)
    assert.match(undecided.body?.error?.message ?? '', /sale with lots/)
  })
})

test('an admin may place with an admin-only method such as Own label', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const address = await anAddress(c, customer)
    const method_id = await fulfillmentMethodId(c, 'OWN LABEL', 'purchase')

    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [{ ...scrap }],
      fulfillment: { method_id, choices: { shipment: { shipper_address_id: address.id } } },
      payout: { method: 'ECHECK' },
    })
    assert.equal(placed.status, 201, placed.text)
  })
})

test('the Review notes ride on the create body and land on the order', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      lots: [],
      notes: 'Called in, ships Friday',
    })
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.order.notes, 'Called in, ships Friday')
  })
})

test('a chosen assignee on the create body overrides auto-assign (ruling 156)', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const employee = await aUser(c, { role: 'admin' })
    const placed = await placeAsAdmin({
      direction: 'purchase',
      user_id: customer.id,
      assigned_to_id: employee.id,
      lots: [],
    })
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.order.assigned_to_id, employee.id)
  })
})
