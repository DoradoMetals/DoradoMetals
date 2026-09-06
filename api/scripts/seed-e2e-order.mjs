process.env.NODE_ENV = 'test'

import '#env'
import { assertSafeDatabase } from './lib/safe-database.ts'

console.log(`database: ${assertSafeDatabase('seed-e2e-order', process.env.DATABASE_URL)}`)

import pool from '#pool'
import query from '#shared/db/query.ts'
import * as checkoutService from '#checkout/service.ts'
import * as fulfillmentDrafts from '#logistics/fulfillments/drafts.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as addressService from '#accounts/places/addresses/service.ts'
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

const { rows: users } = await query(`SELECT id FROM auth.users WHERE email = $1`, [
  E2E_CUSTOMER.email,
])
if (!users.length) {
  console.error('the e2e customer does not exist - run `pnpm --filter @dorado/api seed:e2e` first')
  process.exit(1)
}
const user_id = users[0].id

const { rows: products } = await query(`SELECT id FROM products.bullion ORDER BY name LIMIT 1`)
if (!products.length) {
  console.error('no product in dev to put on the order')
  process.exit(1)
}

const { rows: services } = await query(
  `SELECT id FROM shipping.services WHERE carrier_id IS NOT NULL ORDER BY name LIMIT 1`
)
if (!services.length) {
  console.error('no carrier label service in dev to put on the shipment')
  process.exit(1)
}

const { rows: packages } = await query(
  `SELECT id FROM shipping.packages WHERE carrier_id IS NULL ORDER BY min_weight_lb NULLS FIRST LIMIT 1`
)
if (!packages.length) {
  console.error('no offered package in dev to put on the shipment')
  process.exit(1)
}

const { rows: methods } = await query(
  `SELECT id FROM fulfillments.methods
    WHERE direction = 'purchase' AND category = 'SHIPMENT' AND type = 'CARRIER PICKUP'
      AND enabled LIMIT 1`
)
if (!methods.length) {
  console.error('no CARRIER PICKUP fulfillment method in dev')
  process.exit(1)
}

// The address book is places.user_addresses now, keyed by `label` - the
// frozen exchange.addresses row this used to look for is not what the API
// reads, and addressService.create takes three positional arguments.
const { rows: existingAddr } = await query(
  `SELECT address_id AS id FROM places.user_addresses
    WHERE user_id = $1 AND label = 'e2e-order-seed' LIMIT 1`,
  [user_id]
)

const address = existingAddr.length
  ? { id: existingAddr[0].id }
  : (
      await addressService.create(
        user_id,
        {
          line_1: '6100 E2E Seed St',
          city: 'Houston',
          state: 'TX',
          country: 'United States',
          zip: '77005',
          country_code: 'US',
          phone_number: '7135551234',
        },
        { label: 'e2e-order-seed', recipient_name: E2E_CUSTOMER.name }
      )
    ).address

const { id: checkout_row_id } = await checkoutService.getRowFor(user_id, 'purchase')
const draft = await fulfillmentDrafts.createForCheckout(
  { checkout_id: checkout_row_id, method_id: methods[0].id },
  user_id,
  false
)
await fulfillmentService.patchChoices(draft.fulfillment.id, {
  shipment: {
    shipper_address_id: address.id,
    package_id: packages[0].id,
    carrier_service_id: services[0].id,
    pickup_date: '2026-09-15',
    pickup_time: '10:30:00',
  },
})
await checkoutService.saveCheckoutPayout(user_id, 'purchase', {
  method: 'ECHECK',
  payout_email: E2E_CUSTOMER.email,
  account_holder_name: E2E_CUSTOMER.name,
})
await checkoutService.replaceItems(user_id, 'purchase', [
  { bullion_id: products[0].id, quantity: 1 },
])

const { id: checkout_id } = await checkoutService.getRowFor(user_id, 'purchase')

const order = await place(checkout_id, world)

console.log(JSON.stringify({ order_id: order.order.id, number: order.order.number ?? null }))
await pool.end()
