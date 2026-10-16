process.env.NODE_ENV = 'test'

import '#env'
import fs from 'node:fs'
import path from 'node:path'
import { assertSafeDatabase } from './lib/safe-database.ts'

console.log(`database: ${assertSafeDatabase('seed-e2e-order', process.env.DATABASE_URL)}`)

import pool from '#pool'
import query from '#shared/db/query.ts'
import * as checkoutService from '#checkout/service.ts'
import * as fulfillmentDrafts from '#logistics/fulfillments/drafts.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as addressService from '#accounts/places/addresses/service.ts'
import * as orderSpotsService from '#orders/spots/service.ts'
import * as orderService from '#orders/service.ts'
import * as orderRead from '#orders/read.ts'
import * as pricing from '#pricing/index.ts'
import { place } from '#orders/place.ts'

// The seed exists so a disposable order can be minted without buying a real
// FedEx label or sending mail: every outside-world call in `place`'s LIVE
// contract is stubbed here.
const world = {
  async buyLabel() {},
  async authorize() {},
  async confirm() {},
}
const E2E_CUSTOMER = { email: 'e2e-customer@example.invalid', name: 'E2E Customer' }

const MARKERS = {
  purchase: 'e2e-fixture:screen-purchase',
  sale: 'e2e-fixture:screen-sale',
  disposablePurchase: 'e2e-fixture:disposable-purchase',
  disposableSale: 'e2e-fixture:disposable-sale',
}
const FIXTURES = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'frontend',
  'playwright',
  '.fixtures',
  'orders.json'
)

const one = async (sql, params, what) => {
  const { rows } = await query(sql, params)
  if (!rows.length) {
    console.error(what)
    process.exit(1)
  }
  return rows
}

const [{ id: user_id }] = await one(
  `SELECT id FROM auth.users WHERE email = $1`,
  [E2E_CUSTOMER.email],
  'the e2e customer does not exist - run `pnpm --filter @dorado/api seed:e2e` first'
)

const products = await one(
  `SELECT id FROM products.bullion ORDER BY name LIMIT 2`,
  [],
  'no product in dev to put on the order'
)

const [{ id: sale_product_id }] = await one(
  `SELECT id FROM products.bullion WHERE display = true ORDER BY name LIMIT 1`,
  [],
  'no displayed product in dev to sell'
)

const [{ id: service_id }] = await one(
  `SELECT id FROM shipping.services WHERE carrier_id IS NOT NULL ORDER BY name LIMIT 1`,
  [],
  'no carrier label service in dev to put on the shipment'
)

const [{ id: package_id }] = await one(
  `SELECT id FROM shipping.packages WHERE carrier_id IS NULL ORDER BY min_weight_lb NULLS FIRST LIMIT 1`,
  [],
  'no offered package in dev to put on the shipment'
)

const methodOf = async (direction, type) =>
  (
    await one(
      `SELECT id FROM fulfillments.methods
        WHERE direction = $1 AND category = 'SHIPMENT' AND type = $2 AND enabled AND NOT hidden LIMIT 1`,
      [direction, type],
      `no ${type} ${direction} fulfillment method in dev`
    )
  )[0].id

const [{ id: card_method_id }] = await one(
  `SELECT id FROM payments.methods WHERE direction = 'sale' AND type = 'CARD' AND enabled LIMIT 1`,
  [],
  'no enabled CARD sale payment method in dev'
)

// The address book is places.user_addresses now, keyed by `label` - the
// frozen exchange.addresses row this used to look for is not what the API
// reads, and addressService.create takes three positional arguments.
async function ensureAddress(label, line_1, zip) {
  const { rows } = await query(
    `SELECT address_id AS id FROM places.user_addresses
      WHERE user_id = $1 AND label = $2 LIMIT 1`,
    [user_id, label]
  )
  if (rows.length) return rows[0].id
  const created = await addressService.create(
    user_id,
    {
      line_1,
      city: 'Houston',
      state: 'TX',
      country: 'United States',
      zip,
      country_code: 'US',
      phone_number: '7135551234',
    },
    { label, recipient_name: E2E_CUSTOMER.name }
  )
  return created.address.id
}

const address_id = await ensureAddress('e2e-order-seed', '6100 E2E Seed St', '77005')
const second_address_id = await ensureAddress('e2e-order-seed-2', '6200 E2E Second St', '77006')

async function findMarked(marker) {
  const { rows } = await query(
    `SELECT id FROM orders.orders WHERE user_id = $1 AND notes = $2 ORDER BY created_at LIMIT 1`,
    [user_id, marker]
  )
  return rows[0]?.id ?? null
}

async function mark(order_id, marker) {
  await query(`UPDATE orders.orders SET notes = $2 WHERE id = $1`, [order_id, marker])
}

async function placePurchase() {
  const { id: checkout_row_id } = await checkoutService.getRowFor(user_id, 'purchase')
  const draft = await fulfillmentDrafts.createForCheckout(
    { checkout_id: checkout_row_id, method_id: await methodOf('purchase', 'CARRIER PICKUP') },
    user_id,
    false
  )
  await fulfillmentService.patchChoices(draft.fulfillment.id, {
    shipment: {
      shipper_address_id: address_id,
      package_id,
      carrier_service_id: service_id,
      pickup_date: '2026-09-15',
      pickup_time: '10:30:00',
    },
  })
  await checkoutService.saveCheckoutPayout(user_id, 'purchase', {
    method: 'ECHECK',
    payout_email: E2E_CUSTOMER.email,
    account_holder_name: E2E_CUSTOMER.name,
  })
  await checkoutService.replaceLots(
    user_id,
    'purchase',
    products.map((product) => ({ bullion_id: product.id, quantity: 1 }))
  )
  const { id: checkout_id } = await checkoutService.getRowFor(user_id, 'purchase')
  return (await place(checkout_id, world)).order.id
}

async function normalizePurchase(order_id) {
  const view = await orderRead.view(order_id)
  if (view.order.spots_locked && view.totals?.total == null) {
    await orderSpotsService.setSpots(order_id, { lock: false })
  }
  for (const product of products.slice(view.lots.length)) {
    await orderService.addLot(order_id, { bullion_id: product.id, quantity: 1 })
  }
}

async function plantCardPayment(amount) {
  await query(
    `UPDATE payments.intents i SET status = 'canceled'
      WHERE i.user_id = $1 AND i.order_id IS NULL AND i.status <> 'canceled'
        AND EXISTS (SELECT 1 FROM payments.attempts a
                     WHERE a.intent_id = i.id AND a.provider_ref LIKE 'pi_e2e_%')`,
    [user_id]
  )
  const {
    rows: [card],
  } = await query(
    `INSERT INTO payments.details (user_id, method_id, last_four, card_brand, provider, provider_ref)
     VALUES ($1, $2, '4242', 'visa', 'stripe', 'pm_e2e_' || replace(gen_random_uuid()::text, '-', ''))
     RETURNING id`,
    [user_id, card_method_id]
  )
  const {
    rows: [intent],
  } = await query(
    `INSERT INTO payments.intents (user_id, method_id, details_id, amount_expected, status, type)
     VALUES ($1, $2, $3, $4, 'succeeded', 'sales_order_checkout') RETURNING id`,
    [user_id, card_method_id, card.id, amount]
  )
  const {
    rows: [attempt],
  } = await query(
    `INSERT INTO payments.attempts (intent_id, method_id, provider, provider_ref, amount, status)
     VALUES ($1, $2, 'stripe', 'pi_e2e_' || replace(gen_random_uuid()::text, '-', ''), $3, 'succeeded')
     RETURNING id`,
    [intent.id, card_method_id, amount]
  )
  await query(
    `INSERT INTO payments.settlements (attempt_id, settled_amount, provider, provider_ref, settled_at)
     VALUES ($1, $2, 'stripe', 'ch_e2e_' || replace(gen_random_uuid()::text, '-', ''), now())`,
    [attempt.id, amount]
  )
}

async function placeSale() {
  const { id: checkout_row_id } = await checkoutService.getRowFor(user_id, 'sale')
  const draft = await fulfillmentDrafts.createForCheckout(
    { checkout_id: checkout_row_id, method_id: await methodOf('sale', 'DROPSHIP') },
    user_id,
    false
  )
  await fulfillmentService.patchChoices(draft.fulfillment.id, {
    shipment: { package_id, carrier_service_id: service_id },
  })
  await checkoutService.patchCheckout(user_id, 'sale', {
    payment_method_id: card_method_id,
    recipient_address_id: address_id,
  })
  await checkoutService.replaceLots(user_id, 'sale', [{ bullion_id: sale_product_id, quantity: 1 }])
  const { id: checkout_id } = await checkoutService.getRowFor(user_id, 'sale')
  const quote = await pricing.priceCheckout(checkout_id)
  const amount = Number(quote?.post_charges_amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`the sale checkout priced no card charge (${amount})`)
    process.exit(1)
  }
  await plantCardPayment(amount)
  return (await place(checkout_id, world)).order.id
}

async function normalizeSale(order_id) {
  await query(
    `UPDATE shipping.shipments s
        SET tracking_number = '7946' || lpad((o.number % 100000000)::text, 8, '0')
       FROM fulfillments.shipments fs
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       JOIN orders.orders o ON o.id = f.order_id
      WHERE fs.shipment_id = s.id AND f.order_id = $1
        AND s.direction = 'Outbound' AND s.tracking_number IS NULL
        AND s.shipped_at IS NULL AND s.delivered_at IS NULL`,
    [order_id]
  )
}

async function standing(marker, build, normalize) {
  const found = await findMarked(marker)
  const order_id = found ?? (await build())
  if (!found) await mark(order_id, marker)
  await normalize(order_id)
  return order_id
}

const purchase = await standing(MARKERS.purchase, placePurchase, normalizePurchase)
const sale = await standing(MARKERS.sale, placeSale, normalizeSale)

const WIDTHS = ['desktop', 'mobile']
const disposable_purchases = {}
const disposable_sales = {}
for (const width of WIDTHS) {
  const purchase_id = await placePurchase()
  await mark(purchase_id, MARKERS.disposablePurchase)
  await normalizePurchase(purchase_id)
  disposable_purchases[width] = purchase_id

  const sale_id = await placeSale()
  await mark(sale_id, MARKERS.disposableSale)
  await normalizeSale(sale_id)
  disposable_sales[width] = sale_id
}
const disposablePurchase = disposable_purchases.desktop

const fixtures = {
  purchase,
  sale,
  disposable_purchases,
  disposable_sales,
  addresses: [address_id, second_address_id],
}
fs.mkdirSync(path.dirname(FIXTURES), { recursive: true })
fs.writeFileSync(FIXTURES, JSON.stringify(fixtures, null, 2) + '\n')

const { rows: numbers } = await query(`SELECT number FROM orders.orders WHERE id = $1`, [
  disposablePurchase,
])
console.log(JSON.stringify({ order_id: disposablePurchase, number: numbers[0]?.number ?? null }))
console.log(JSON.stringify(fixtures))
await pool.end()
