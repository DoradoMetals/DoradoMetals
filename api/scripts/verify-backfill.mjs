import '#env'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import pool from '#pool'
import { NATIVE_SCHEMAS as SCHEMAS, assertSchemasComplete } from './lib/schemas.ts'

const PREFIX = 'zz_backfill_'
const SHOW_VALUES = process.argv.includes('--values')
const SELF_TEST_ONLY = process.argv.includes('--self-test')
const SHOW_ALL = process.argv.includes('--all')

const rename = (sql) =>
  SCHEMAS.reduce((acc, s) => acc.replace(new RegExp(`\\b${s}\\.`, 'g'), `${PREFIX}${s}.`), sql)

// A table is compared over the POPULATION the backfill can produce - the keys
// that exist in `exchange` - because application code has written only the
// native schemas since the write pivot (D212/D214). A live row outside that
// population was created natively and no backfill can derive it; a live row
// INSIDE it that the rebuild did not produce is a backfill defect. `population`
// is therefore SQL over `exchange` alone, returning the key columns.
//
// `native` names the columns native code legitimately rewrites on a row the
// backfill did produce. Both carry a reason; an empty one fails the script.

// Migrations that fill a backfilled table and are NOT named "backfill" or
// "seed", so the pattern above cannot find them. Without this the rebuild
// leaves a column empty and the comparison calls dev's real value a
// difference - or, worse, agrees with an empty one.
//
// This is invisible on dev and loud on a production-shaped database: dev's
// exchange.payouts holds no bank numbers at all, so both sides of the
// `last_four` comparison are null and it passes for the wrong reason. On a
// rebuilt copy of production it is 14 rows. (2026-09-06, ruling 82 rehearsal.)
const EXTRA_BACKFILLS = {
  '114_the_payout_reads_leave_exchange.sql':
    'derives payments.details.last_four and routing_last_four from ' +
    'exchange.payouts, and its name says nothing about backfilling',
}

const TABLES = [
  {
    name: 'payments.stripe_charges',
    key: 'payment_intent_id',
    cols: 'payment_intent_id, charge_id, created_at, amount, amount_refunded, fee, currency, captured, status, refunded_at, payment_source_type, stripe_customer_id, livemode',
  },
  { name: 'metals.metals', key: 'id', cols: 'id' },
  {
    name: 'spots.spots',
    key: 'metal_id',
    cols: 'metal_id, ask, bid, percent_change, dollar_change',
    native: {
      ask: 'the spot ticker refreshes it on a cron; exchange holds the price at pivot time',
      bid: 'same ticker, same write',
      percent_change: 'same ticker, same write',
      dollar_change: 'same ticker, same write',
    },
  },
  {
    name: 'media.images',
    key: 'id',
    cols: 'id, bucket, mime_type, size_bytes, width, height, checksum, metadata, path, filename, user_id, created_at',
    population: {
      sql: 'SELECT id FROM exchange.images',
      why: 'an upload after the pivot writes media.images only',
    },
  },
  {
    name: 'organizations.organizations',
    key: 'type, name',
    cols: 'type, name, email, phone, website, description, enabled, created_at, updated_at',
  },
  {
    name: 'refiners.spots',
    key: 'id',
    cols: 'id, order_id, metal_id, ask, bid, scrap_percentage, bullion_percentage',
    population: {
      sql: `SELECT m.id FROM exchange.refiner_metals m
             WHERE coalesce(m.purchase_order_id, m.sales_order_id) IS NOT NULL
               AND EXISTS (SELECT 1 FROM exchange.metals mt WHERE mt.type = m.type)
               AND (EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = m.purchase_order_id)
                 OR EXISTS (SELECT 1 FROM exchange.sales_orders o WHERE o.id = m.sales_order_id))`,
      why: 'an order created natively mints its own refiner spot rows',
    },
  },
  {
    name: 'refiners.items',
    key: 'order_item_id',
    cols: 'order_item_id, bullion_id, metal_id, pre_melt, post_melt, purity, content, premium, quantity, unit',
    population: {
      sql: `SELECT poi.id AS order_item_id
              FROM exchange.purchase_order_items poi
              LEFT JOIN exchange.scrap sc ON sc.id = poi.scrap_id
              LEFT JOIN exchange.products pr ON pr.id = poi.product_id
             WHERE coalesce(sc.metal_id, pr.metal_id) IS NOT NULL
               AND EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = poi.purchase_order_id)`,
      why: '066 reads purchase lines only, and an order created natively mints its own refiner items',
    },
  },
  {
    name: 'payments.intents',
    key: 'id',
    cols: 'id, order_id, method_id, amount_expected, status, session_id, user_id, type',
    population: {
      sql: 'SELECT id FROM exchange.payment_intents',
      why: 'checkout creates an intent natively; exchange stopped receiving them at the pivot',
    },
    absentInDev:
      '22 dual-era intents from 2026-09-01/02 whose native rows were deleted (payments/intents has a delete path and the sweeps use it); exchange kept its frozen copy',
    rebuildDiffers: {
      user_id:
        "076 declines to reproduce a user_id no auth.users row backs, because 117's intents_user_fk is NOT VALID and a fresh write of a dangling id raises 23503",
    },
  },
  {
    name: 'payments.attempts',
    key: 'id',
    cols: 'id, intent_id, method_id, provider, provider_ref, amount, status',
    population: {
      sql: 'SELECT id FROM exchange.payment_intents WHERE payment_intent_id IS NOT NULL',
      why: '074 mints one attempt per charged exchange intent, sharing its id; a native intent mints its own',
    },
    absentInDev: 'an attempt goes with the intent whose native row was deleted',
  },
  {
    name: 'payments.settlements',
    key: 'id',
    cols: 'id, attempt_id, settled_amount, provider, provider_ref',
  },
  {
    name: 'payments.details',
    key: 'id',
    cols: 'id, user_id, method_id, account_holder, bank_name, account_type, email_to, provider, provider_ref, last_four, card_brand',
    population: {
      sql: `SELECT id FROM exchange.payouts WHERE user_id IS NOT NULL
            UNION ALL SELECT id FROM exchange.payment_intents WHERE method_id IS NOT NULL`,
      why: 'a payout account saved after the pivot is sealed into payments.details only',
    },
    absentInDev: 'a detail row goes with the intent whose native row was deleted',
  },
  {
    name: 'payments.ledger',
    key: 'id',
    cols: 'id, user_id, type, order_id, amount, occurred_at',
    population: {
      sql: 'SELECT id FROM exchange.account_transactions',
      why: 'every balance movement since 118 writes payments.ledger and nothing else',
    },
  },
  {
    name: 'refiners.refiners',
    key: 'id',
    cols: "id, logo, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id) AS organization",
  },
  {
    name: 'shipping.carriers',
    key: 'id',
    cols: "id, logo, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id) AS organization",
  },
  {
    name: 'products.mints',
    key: 'id',
    cols: "id, name, type, country, created_at, updated_at, image_id, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id) AS organization",
  },
  {
    name: 'products.bullion',
    key: 'id',
    cols: `id, metal_id, mint_id, supplier_id, name, description, type, bid_premium,
           ask_premium, display, homepage_display, legal_tender,
           domestic_tender, is_generic, content, gross, purity, variant_group,
           variant_label, shadow_offset, slug, filter_category, image_front,
           image_back, created_by, updated_by, created_by_id,
           updated_by_id, created_at, updated_at`,
    population: {
      sql: 'SELECT id FROM exchange.products',
      why: 'the catalogue only grows, and since the pivot it grows natively',
    },
  },
  {
    name: 'leads.leads',
    key: 'id',
    cols: `id, name, phone, email, created_at, updated_at, last_contacted, converted,
           contacted, responded, created_by, updated_by, notes, contact, priority,
           created_by_id, updated_by_id`,
    population: {
      sql: 'SELECT id FROM exchange.leads',
      why: 'a lead captured after the pivot writes leads.leads only',
    },
    native: {
      created_by_id:
        'a lead captured natively leaves it null; 029 maps the legacy created_by name to a user id instead',
      updated_by_id: 'same, on the other half of the pair',
    },
  },
  {
    name: 'rates.rates',
    key: 'id',
    cols: `id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct, created_at,
           updated_at, created_by, updated_by, created_by_id, updated_by_id`,
    population: {
      sql: 'SELECT id FROM exchange.rates',
      why: 'a rate added after the pivot writes rates.rates only',
    },
  },
  {
    name: 'reviews.reviews',
    key: 'id',
    cols: `id, order_id, name, review_text, rating, hidden, created_at,
           updated_at, created_by, updated_by, created_by_id, updated_by_id`,
    population: {
      sql: 'SELECT id FROM exchange.reviews',
      why: 'a review left after the pivot writes reviews.reviews only',
    },
  },
  {
    name: 'tax.sales_tax_rules',
    key: 'id',
    cols: `id, state_code, metal_category::text, product_type::text, min_price, max_price,
           purity_min, purity_max, aggregate_min, aggregate_max, markup_min_pct,
           markup_max_pct, tax_rate, weight_min, weight_max, is_domestic, is_legal_tender`,
  },
  {
    name: 'tax.sales_tax',
    key: 'id',
    cols: 'id, state, reached_nexus, amount_owed, last_remitted',
  },
  {
    name: 'shipping.shipments',
    key: 'id',
    cols: `id, tracking_number, delivered_at, shipped_at, est_delivery, label_type,
           direction::text, insured, declared_value, cost, shipping_status,
           pickup_type, created_at,
           (SELECT sv.name FROM $S$shipping.services sv WHERE sv.id = t.carrier_service_id) AS carrier_service,
           (SELECT pk.label FROM $S$shipping.packages pk WHERE pk.id = t.package_id) AS package`,
    population: {
      sql: 'SELECT id FROM exchange.shipments',
      why: 'a label bought after the pivot writes shipping.shipments only',
    },
    native: {
      shipping_status: 'the FedEx tracking sweep advances it on the native row',
      delivered_at: 'same sweep, same write',
      est_delivery: 'same sweep, same write',
      created_at: "121 made the parcel facts the server's; a re-bought label re-stamps it",
      carrier_service: 'a re-bought label picks the service natively',
    },
  },
  {
    name: 'fulfillments.fulfillments',
    key: 'order_id',
    cols: `order_id, status,
           (SELECT m.type || '/' || m.direction FROM $S$fulfillments.methods m WHERE m.id = t.method_id) AS method`,
    population: {
      sql: `SELECT coalesce(e.purchase_order_id, e.sales_order_id) AS order_id
              FROM exchange.shipments e
             WHERE coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
               AND e.pickup_type IN ('Store Dropoff', 'DropShip')
               AND (EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = e.purchase_order_id)
                 OR EXISTS (SELECT 1 FROM exchange.sales_orders s WHERE s.id = e.sales_order_id))`,
      why: '052 derives a fulfillment from an exchange shipment whose pickup type maps to a method; an order placed natively makes its own',
    },
    native: {
      status: 'the admin drawer advances the fulfillment as the parcel moves',
      method: 'the customer changes the handover method natively before the label is bought',
    },
  },
  {
    name: 'fulfillments.shipments',
    key: 'shipment_id',
    cols: `shipment_id,
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.recipient_location_id) AS recipient_location,
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.shipper_location_id) AS shipper_location`,
    population: {
      sql: `SELECT e.id AS shipment_id FROM exchange.shipments e
             WHERE coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
               AND e.pickup_type IN ('Store Dropoff', 'DropShip')
               AND (EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = e.purchase_order_id)
                 OR EXISTS (SELECT 1 FROM exchange.sales_orders s WHERE s.id = e.sales_order_id))`,
      why: 'the link row follows the fulfillment its shipment made; a label bought natively makes its own',
    },
  },
  {
    name: 'shipping.tracking',
    key: 'id',
    cols: 'id, shipment_id, status, location, time',
    population: {
      sql: 'SELECT id FROM exchange.tracking_events',
      why: 'every scan since the pivot is written to shipping.tracking only',
    },
    absentInDev:
      "tracking.test.js deleted five dev shipments' scan history in August; exchange keeps the only copy and the rebuild is what restores it",
  },
  {
    name: 'places.addresses',
    key: 'id',
    cols: `id, line_1, line_2, city, state, country, zip, country_code,
           phone_number, created_at, updated_at, is_valid, is_residential`,
    population: {
      sql: 'SELECT id FROM exchange.addresses',
      why: "dev's out-of-population rows are its own per-order snapshots plus addresses saved natively after the pivot",
    },
    mintedByRebuild: {
      sql: `SELECT p.id FROM exchange.purchase_orders p JOIN exchange.addresses a ON a.id = p.address_id
            UNION ALL
            SELECT o.id FROM exchange.sales_orders o JOIN exchange.addresses a ON a.id = o.address_id`,
      why: '031 snapshots one address per order with gen_random_uuid(), so the id differs on every rebuild and cannot be matched; the content is compared through orders.addresses',
    },
  },
  {
    name: 'places.user_addresses',
    key: 'user_id, address_id',
    cols: 'user_id, address_id, label, default_shipping, default_billing',
    population: {
      sql: 'SELECT user_id, id AS address_id FROM exchange.addresses WHERE user_id IS NOT NULL',
      why: 'the address book grows natively',
    },
  },

  {
    name: 'orders.orders',
    key: 'direction, number',
    cols: `id, user_id, direction::text, status, number, notes,
           review_created, order_sent, tracking_updated, spots_locked,
           created_by, updated_by, created_at, updated_at`,
    population: {
      sql: `SELECT 'purchase' AS direction, order_number AS number FROM exchange.purchase_orders
            UNION ALL SELECT 'sale', order_number FROM exchange.sales_orders`,
      why: 'an order placed after the pivot writes orders.orders only',
    },
    absentInDev:
      'five dual-era purchase orders from 2026-08-27 were cleaned out of orders.orders and left in exchange, which is frozen and still holds them',
    native: {
      created_by:
        'the dual-era mirror stamped the business where the native insert stamped the customer; exchange is the only record a rebuild has',
      updated_at: "116's audit trigger stamps every native write",
      updated_by: 'same trigger, same write',
      order_sent: 'sending the supplier their copy flips it natively',
      tracking_updated: 'the tracking sweep flips it natively',
      review_created: 'leaving a review flips it natively',
    },
  },
  {
    name: 'orders.transactions',
    key: 'order_id',
    cols: `order_id, total, items, shipping, surcharge, sales_tax, funds,
           refiner_fee, base_total, post_charges_amount, subject_to_charges_amount,
           used_funds, waive_shipping_fee, waive_payout_fee, shipping_paid,
           shipping_fee_actual, pool_remediation, pool_oz_deducted,
           created_by, updated_by, created_at, updated_at`,
    population: {
      sql: `SELECT id AS order_id FROM exchange.purchase_orders
            UNION ALL SELECT id FROM exchange.sales_orders`,
      why: 'the money row follows its order',
    },
    absentInDev: 'the money row goes with the order that was cleaned out of orders.orders',
    native: {
      created_by:
        'the dual-era mirror stamped the business where the native insert stamped the customer; exchange is the only record a rebuild has',
      updated_at: "116's audit trigger stamps every native write",
      updated_by: 'same trigger, same write',
      refiner_fee:
        "the admin drawer enters the refiner's fee once the parcel is weighed; 033 gave the column its first home and exchange has no value to carry",
    },
  },
  {
    name: 'orders.items',
    key: 'id',
    cols: `id, order_id, bullion_id, metal_id, pre_melt, post_melt, content,
           premium, quantity, confirmed, sales_tax_charged, unit,
           price`,
    population: {
      sql: `SELECT poi.id FROM exchange.purchase_order_items poi
             WHERE EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = poi.purchase_order_id)
            UNION ALL
            SELECT soi.id FROM exchange.sales_order_items soi
             JOIN exchange.products pr ON pr.id = soi.product_id
             WHERE EXISTS (SELECT 1 FROM exchange.sales_orders o WHERE o.id = soi.sales_order_id)`,
      why: 'a line added after the pivot writes orders.items only',
    },
    native: {
      confirmed: 'the admin drawer confirms a line once the parcel is opened',
      unit: 'the drawer re-states the weight unit natively',
    },
  },
  {
    name: 'lots.items',
    key: 'id',
    cols: `id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
           content_snapshot`,
    population: {
      sql: `SELECT poi.id FROM exchange.purchase_order_items poi
             WHERE EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = poi.purchase_order_id)
            UNION ALL
            SELECT soi.id FROM exchange.sales_order_items soi
             JOIN exchange.products pr ON pr.id = soi.product_id
             WHERE EXISTS (SELECT 1 FROM exchange.sales_orders o WHERE o.id = soi.sales_order_id)`,
      why: '161 mints one lot per orders.items row, KEEPING ITS ID, so the population is the one orders.items has; a lot minted natively after the pivot, and the three that came out of a basket, are outside it',
    },
    native: {
      unit: 'the admin drawer re-states the weight unit on the lot itself',
      post_melt: 'the drawer records the post-melt weight once the parcel is opened',
      purity: 'the drawer corrects the declared purity after testing',
    },
  },
  {
    name: 'orders.lots',
    key: 'lot_id',
    cols: 'lot_id, order_id, premium, price, sales_tax_charged, confirmed',
    population: {
      sql: `SELECT poi.id AS lot_id FROM exchange.purchase_order_items poi
             WHERE EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = poi.purchase_order_id)
            UNION ALL
            SELECT soi.id FROM exchange.sales_order_items soi
             JOIN exchange.products pr ON pr.id = soi.product_id
             WHERE EXISTS (SELECT 1 FROM exchange.sales_orders o WHERE o.id = soi.sales_order_id)`,
      why: 'the link row carries the id of the line it came from, so it has the same population orders.items has',
    },
    native: {
      confirmed: 'the admin drawer confirms a lot once the parcel is opened',
      premium: 'placement re-tiers the premium by the whole order\'s ounces, and the drawer edits it after',
      price: 'finalize writes the frozen unit price; exchange has no value to carry',
    },
  },
  {
    name: 'orders.spots',
    key: 'order_id, metal_id',
    cols: `order_id, metal_id, ask, bid, scrap_percentage, bullion_percentage,
           created_at, updated_at`,
    population: {
      sql: `SELECT coalesce(m.purchase_order_id, m.sales_order_id) AS order_id, mt.type AS metal_id
              FROM exchange.order_metals m
              JOIN exchange.metals mt ON mt.type = m.type
             WHERE coalesce(m.purchase_order_id, m.sales_order_id) IS NOT NULL
               AND (EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = m.purchase_order_id)
                 OR EXISTS (SELECT 1 FROM exchange.sales_orders o WHERE o.id = m.sales_order_id))`,
      why: 'an order placed natively locks its own spots',
    },
    native: {
      bid: "re-locking an order's spots rewrites it natively",
      bullion_percentage: 'same re-lock, same write',
      created_at: 'a re-locked row carries its own stamp',
      updated_at: "116's audit trigger stamps every native write",
    },
  },
  {
    name: 'orders.addresses',
    key: 'order_id',
    cols: `order_id, (SELECT a.line_1 || '|' || a.city || '|' || a.state || '|' || a.zip
                      FROM $S$places.addresses a WHERE a.id = t.address_id) AS address`,
    population: {
      sql: `SELECT p.id AS order_id FROM exchange.purchase_orders p
             JOIN exchange.addresses a ON a.id = p.address_id
            UNION ALL
            SELECT o.id FROM exchange.sales_orders o
             JOIN exchange.addresses a ON a.id = o.address_id`,
      why: 'an order placed natively snapshots its own address',
    },
  },
]

const NOT_REBUILT = {
  'refiners.orders':
    'created and seeded by 093/094/096 from the ledger; invariant pinned by refiner-edits.test.ts',
  'refining.orders':
    'derived by 163 from refiners.orders, which is itself NOT_REBUILT: the ' +
    'engagements were seeded from the ledger rather than from exchange, so ' +
    'there is no exchange population a rebuild could resolve them against. ' +
    'What 163 preserves instead is the ENGAGEMENT ID, so the mapping is a ' +
    'join anyone can re-run rather than a match on columns.',
  'refining.lots':
    'the assays go with the engagement they were reported against, and ' +
    'refining.orders is not rebuilt from exchange either',
  'refining.pool':
    'two entries derived by 165 from refiners.orders.pool_oz_deducted and ' +
    '.pool_remediation - one legacy column each, on a table exchange does not ' +
    'back; the ledger is append-only afterwards and nothing re-derives it',
  'auth.users': 'backfilled by 029 but compared per-column there, not row-wise',
  'auth.employees': 'seed data, no exchange source',
  'auth.account': 'better-auth owns these tables; auth is not migrated',
  'auth.sessions': 'better-auth owns it; a stale session is a re-login, not lost data',
  'auth.verification': 'better-auth owns it; a verification token outlives nothing',
  'metals.purity_labels':
    'reference data seeded by 175 and 176 - the standard purities a metal is ' +
    'named by, and how far from one a lot may sit and still take its label. ' +
    'exchange never recorded a purity label, so there is nothing to rebuild ' +
    'from: the migration IS the source, and it is idempotent.',
  'payments.methods': 'seed data from 047, no exchange source',
  'fulfillments.methods': 'seed data from 047, no exchange source',

  'fulfillments.pickups': 'no exchange source: exchange never recorded an in-person pickup',
  'fulfillments.directs': 'no exchange source: exchange never recorded a walk-in or appointment',
  'places.locations': 'seed data, no exchange source',
  'places.location_hours': 'seed data, no exchange source',

  'checkout.checkouts': 'cart contents are transient and deliberately not carried across',
  'checkout.items': 'a cart line is as transient as the cart holding it',
  'checkout.lots': 'a basket link is as transient as the cart holding it',
  'shipping.services': 'seed data from 047, no exchange source',
  'shipping.packages': 'seed data from 047, no exchange source',

  'media.emails': 'the mail log was created by 090, after the pivot; exchange never had one',
  'media.pdfs':
    'a rendered document, not a record: the row is a generated artifact of a ' +
    'packing list or invoice and exchange never stored one. Rebuilding it means ' +
    're-rendering from the order, which the document endpoints already do on ' +
    'demand, so there is nothing here a backfill could reproduce or lose.',
  'shipping.pickups':
    'NOT CARRIED, by ruling (Jacob, 2026-09-06): production holds no ' +
    "exchange.carrier_pickups rows at all and dev's are sandbox test rows, so " +
    'there is nothing to migrate. exchange.carrier_pickups keys on the ORDER ' +
    'and shipping.pickups keys on the SHIPMENT, and no backfill bridges them. ' +
    '094 used to RAISE while any row existed; that refusal is removed and the ' +
    'count is no longer pinned, because the decision is not about how many ' +
    'there are. See docs/waves/production-day-fixes.md.',

  'auth.otp_throttles':
    'passwordless auth state (lockout fact and send limits, keyed by subject), ' +
    'created after the pivot by docs/waves/auth-passwordless.md; nothing in exchange',
  'auth.pending_changes':
    'passwordless auth state (an unconfirmed email/phone change), created after ' +
    'the pivot by docs/waves/auth-passwordless.md; nothing in exchange',
  'auth.pending_signups':
    'passwordless auth state (an unconfirmed signup), created after the pivot ' +
    'by docs/waves/auth-passwordless.md; nothing in exchange',

  'crm.sms_messages': 'provider (Twilio) webhook rows, no exchange source',
  'crm.calls': 'provider webhook rows, no exchange source',

  'payments.transfers':
    'Moov/Plaid payout and charge state machine rows, built fresh by ' +
    'docs/waves/payment-rails.md; no vendor was ever called against exchange, ' +
    'so there is no exchange source',
  'payments.transfer_events':
    'append-only provider event log (Moov/Plaid), unique on (provider, event_id); ' +
    'docs/waves/payment-rails.md builds it fresh, no exchange source',
  'payments.inbound_transactions':
    'inbound money movements learned from Moov/Plaid/manual entry, matched ' +
    'against transfers; docs/waves/payment-rails.md builds it fresh, no exchange source',
  'payments.feed_cursors':
    "the one row Plaid's Transactions sync needs to resume; " +
    'docs/waves/payment-rails.md builds it fresh, no exchange source',
  'payments.bank_links':
    'a reference to a Moov-vaulted bank account (ids and last four only, no ' +
    'routing/account numbers); docs/waves/payment-rails.md builds it fresh, no exchange source',

  'fulfillments.dropoffs':
    'the Drop-off handover category added by migration 166/167 ' +
    '(docs/waves/lots-build.md): no exchange source, exchange never recorded a drop-off',
}

// ---------------------------------------------------------------------------

const splitTop = (s) => {
  const out = []
  let depth = 0
  let cur = ''
  let quoted = false
  for (const ch of s) {
    if (quoted) {
      cur += ch
      if (ch === "'") quoted = false
      continue
    }
    if (ch === "'") quoted = true
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

const reasoned = (why) => typeof why === 'string' && why.trim().length >= 10

const prepare = (t) => {
  const parts = splitTop(t.cols).map((part) => {
    const aliased = /\bAS\s+([a-z_][a-z0-9_]*)$/i.exec(part)
    if (aliased) return { label: aliased[1], expr: part.slice(0, aliased.index).trim() }
    if (/^[a-z_][a-z0-9_]*$/i.test(part)) return { label: part, expr: `t."${part}"` }
    const cast = /^([a-z_][a-z0-9_]*)(::[a-z_ ]+)$/i.exec(part)
    if (cast) return { label: cast[1], expr: `t."${cast[1]}"${cast[2]}` }
    throw new Error(`${t.name}: column \`${part}\` needs an AS alias so a report can name it`)
  })
  const labels = parts.map((p) => p.label)
  const keyLabels = t.key.split(',').map((k) => k.trim())
  const dupe = labels.find((l, i) => labels.indexOf(l) !== i)
  if (dupe) throw new Error(`${t.name}: two columns are both called \`${dupe}\``)
  for (const k of keyLabels) {
    if (!labels.includes(k))
      throw new Error(`${t.name}: key column \`${k}\` is not among the compared columns`)
  }
  for (const kind of ['native', 'rebuildDiffers']) {
    for (const [col, why] of Object.entries(t[kind] ?? {})) {
      if (!labels.includes(col))
        throw new Error(`${t.name}: ${kind} column \`${col}\` is not compared`)
      if (keyLabels.includes(col))
        throw new Error(`${t.name}: \`${col}\` is a key column and cannot be excluded`)
      if (!reasoned(why)) {
        throw new Error(
          `${t.name}: ${kind} column \`${col}\` has no reason, which would make it a silent exclusion`
        )
      }
    }
  }
  if (t.population) {
    if (!reasoned(t.population.why)) {
      throw new Error(
        `${t.name}: the population has no reason, which would make it a silent exclusion`
      )
    }
    const native = SCHEMAS.find((s) => new RegExp(`\\b${s}\\.`).test(t.population.sql))
    if (native)
      throw new Error(
        `${t.name}: the population reads ${native}.*; it must be derived from exchange alone`
      )
  }
  if (t.absentInDev && !reasoned(t.absentInDev))
    throw new Error(`${t.name}: absentInDev has no reason`)
  if (t.mintedByRebuild && !reasoned(t.mintedByRebuild.why)) {
    throw new Error(
      `${t.name}: mintedByRebuild has no reason, which would make it a silent exclusion`
    )
  }
  return { ...t, parts, labels, keyLabels }
}

const SEP = '\u0001'
const NUL = '\u0000'
const keyOf = (t, row) => t.keyLabels.map((l) => (row[l] == null ? NUL : String(row[l]))).join(SEP)
const show = (k) => k.split(SEP).join(', ')

// The comparison is a pure function so --self-test can prove it sees an
// undeclared difference and stays quiet about a declared one.
export const diffTable = (t, live, built, population, mintedExpected = null) => {
  const fail = []
  const bucket = {
    compared: 0,
    nativeOnly: 0,
    absentInDev: 0,
    minted: 0,
    drift: 0,
    driftCols: new Set(),
    declined: 0,
    declinedCols: new Set(),
  }

  if (population && population.size === 0) {
    fail.push(`${t.name}: the population query resolved nothing, so it can classify nothing`)
    return { fail, bucket }
  }

  for (const k of live.keys()) {
    if (built.has(k)) continue
    if (!population)
      fail.push(`${t.name}: the backfill did not produce the row dev holds at ${show(k)}`)
    else if (population.has(k)) {
      fail.push(
        `${t.name}: exchange holds the source of ${show(k)} and the backfill did not produce it`
      )
    } else bucket.nativeOnly++
  }

  for (const k of built.keys()) {
    if (live.has(k)) continue
    if (population && !population.has(k)) {
      if (t.mintedByRebuild) bucket.minted++
      else
        fail.push(
          `${t.name}: the backfill produced ${show(k)}, which the declared exchange population does not contain`
        )
    } else if (t.absentInDev) bucket.absentInDev++
    else fail.push(`${t.name}: the backfill produced ${show(k)} and dev does not have it`)
  }

  if (t.mintedByRebuild && mintedExpected != null && bucket.minted !== mintedExpected) {
    fail.push(
      `${t.name}: the rebuild minted ${bucket.minted} row(s) with a generated id and exchange justifies ${mintedExpected}`
    )
  }

  if (population) {
    for (const k of population) {
      if (!live.has(k) && !built.has(k)) {
        fail.push(
          `${t.name}: the population claims ${show(k)}, which neither dev nor the rebuild holds`
        )
        break
      }
    }
  }

  for (const [k, row] of live) {
    const other = built.get(k)
    if (!other) continue
    bucket.compared++
    for (const c of t.labels) {
      if (t.keyLabels.includes(c) || row[c] === other[c]) continue
      if (t.native?.[c]) {
        bucket.drift++
        bucket.driftCols.add(c)
        continue
      }
      if (t.rebuildDiffers?.[c]) {
        bucket.declined++
        bucket.declinedCols.add(c)
        continue
      }
      fail.push(
        `${t.name}: ${show(k)} differs on \`${c}\`${SHOW_VALUES ? `  dev=${row[c]}  built=${other[c]}` : ''}`
      )
    }
  }

  return { fail, bucket }
}

const selfTest = () => {
  const t = prepare({
    name: 't.t',
    key: 'id',
    cols: 'id, status, amount',
    native: { status: 'an admin advances it after the pivot' },
    population: { sql: 'SELECT id FROM exchange.t', why: 'created natively after the pivot' },
  })
  const row = (id, status, amount) => [id, { id, status, amount }]
  const map = (...rows) => new Map(rows)
  const pop = (...ids) => new Set(ids)
  const cases = []
  const check = (name, ok) => cases.push({ name, ok })
  const refuses = (fn) => {
    try {
      fn()
      return false
    } catch {
      return true
    }
  }

  const undeclared = diffTable(t, map(row('1', 'A', '5')), map(row('1', 'A', '6')), pop('1'))
  check(
    'an undeclared column difference is reported',
    undeclared.fail.length === 1 && /`amount`/.test(undeclared.fail[0])
  )

  const declared = diffTable(t, map(row('1', 'B', '5')), map(row('1', 'A', '5')), pop('1'))
  check(
    'a declared native column is not reported',
    declared.fail.length === 0 && declared.bucket.drift === 1
  )

  const outside = diffTable(
    t,
    map(row('1', 'A', '5'), row('2', 'A', '5')),
    map(row('1', 'A', '5')),
    pop('1')
  )
  check(
    'a live row outside the population is out of scope',
    outside.fail.length === 0 && outside.bucket.nativeOnly === 1
  )

  const missed = diffTable(
    t,
    map(row('1', 'A', '5'), row('2', 'A', '5')),
    map(row('1', 'A', '5')),
    pop('1', '2')
  )
  check(
    'a live row inside the population that the backfill missed is reported',
    missed.fail.length === 1
  )

  const stray = diffTable(
    t,
    map(row('1', 'A', '5')),
    map(row('1', 'A', '5'), row('9', 'A', '5')),
    pop('1')
  )
  check('a built row outside the population is reported', stray.fail.length === 1)

  const declines = prepare({
    ...t,
    rebuildDiffers: { amount: 'the rebuild declines to reproduce it' },
  })
  const declined = diffTable(declines, map(row('1', 'A', '5')), map(row('1', 'A', '6')), pop('1'))
  check(
    'a column the rebuild declines to reproduce is not reported',
    declined.fail.length === 0 && declined.bucket.declined === 1
  )

  const mints = prepare({
    ...t,
    mintedByRebuild: { sql: 'SELECT 1', why: 'the rebuild mints it with a generated id' },
  })
  const minted = diffTable(
    mints,
    map(row('1', 'A', '5')),
    map(row('1', 'A', '5'), row('9', 'A', '5')),
    pop('1'),
    1
  )
  check(
    'a row the rebuild mints with a generated id is out of scope',
    minted.fail.length === 0 && minted.bucket.minted === 1
  )

  const miscount = diffTable(
    mints,
    map(row('1', 'A', '5')),
    map(row('1', 'A', '5'), row('9', 'A', '5')),
    pop('1'),
    2
  )
  check(
    'minting more or fewer rows than exchange justifies is reported',
    miscount.fail.length === 1
  )

  const unscoped = diffTable(
    { ...t, population: undefined },
    map(row('1', 'A', '5'), row('2', 'A', '5')),
    map(row('1', 'A', '5')),
    null
  )
  check('an undeclared table cannot hide a live-only row', unscoped.fail.length === 1)

  const blind = diffTable(t, map(row('1', 'A', '5')), map(row('1', 'A', '5')), pop())
  check('a population that resolves nothing is reported', blind.fail.length === 1)

  const overclaim = diffTable(t, map(row('1', 'A', '5')), map(row('1', 'A', '5')), pop('1', '7'))
  check('a population claiming a row neither side holds is reported', overclaim.fail.length === 1)

  check(
    'an exclusion without a reason fails',
    refuses(() => prepare({ name: 't.t', key: 'id', cols: 'id, status', native: { status: '' } }))
  )
  check(
    'a rebuildDiffers without a reason fails',
    refuses(() =>
      prepare({ name: 't.t', key: 'id', cols: 'id, status', rebuildDiffers: { status: '' } })
    )
  )
  check(
    'a mintedByRebuild without a reason fails',
    refuses(() =>
      prepare({ name: 't.t', key: 'id', cols: 'id', mintedByRebuild: { sql: 'SELECT 1', why: '' } })
    )
  )
  check(
    'a column no report could name fails',
    refuses(() => prepare({ name: 't.t', key: 'id', cols: 'id, (SELECT 1 FROM x)' }))
  )
  check(
    'a population reading a native schema fails',
    refuses(() =>
      prepare({
        name: 't.t',
        key: 'id',
        cols: 'id',
        population: { sql: 'SELECT id FROM orders.orders', why: 'not from exchange' },
      })
    )
  )

  for (const c of cases) if (!c.ok) console.log(`  FAIL  ${c.name}`)
  return { ok: cases.every((c) => c.ok), n: cases.length }
}

const st = selfTest()
if (!st.ok) {
  console.error(
    "the detector's own self-test failed; nothing it reports about the backfill can be trusted"
  )
  process.exit(1)
}
if (SELF_TEST_ONLY) {
  console.log(
    `self-test passed: ${st.n} cases, every planted difference seen and every declared one ignored`
  )
  await pool.end()
  process.exit(0)
}

const PREPARED = TABLES.map(prepare)

const client = await pool.connect()
let failures = 0
const note = (m) => {
  failures++
  console.log(`  DIFF  ${m}`)
}

const rowsOf = async (schemaPrefix, t) => {
  const inner = t.parts
    .map((p) => `(${p.expr.replaceAll('$S$', schemaPrefix)})::text AS "${p.label}"`)
    .join(', ')
  const { rows } = await client.query(
    `SELECT to_jsonb(x) AS r FROM (SELECT ${inner} FROM ${schemaPrefix}${t.name} t) x`
  )
  return new Map(rows.map(({ r }) => [keyOf(t, r), r]))
}

const populationOf = async (t) => {
  if (!t.population) return null
  const cols = t.keyLabels.map((l) => `(p."${l}")::text AS "${l}"`).join(', ')
  const { rows } = await client.query(`SELECT ${cols} FROM (${t.population.sql}) p`)
  return new Set(rows.map((r) => keyOf(t, r)))
}

const mintedOf = async (t) => {
  if (!t.mintedByRebuild) return null
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM (${t.mintedByRebuild.sql}) m`)
  return rows[0].n
}

const started = Date.now()

try {
  await assertSchemasComplete((sql) => client.query(sql).then((r) => r.rows))

  const ddl = execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, 'dump-schema.mjs'), '--stdout', '--prefix', PREFIX],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )

  const dir = path.join(import.meta.dirname, '..', 'migrations')
  const backfillFiles = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith('.sql') &&
        (f.includes('backfill') || f.includes('seed') || f in EXTRA_BACKFILLS) &&
        f.slice(0, 3) > '028'
    )
    .sort()

  for (const name of Object.keys(EXTRA_BACKFILLS)) {
    if (!backfillFiles.includes(name)) {
      console.error(
        `EXTRA_BACKFILLS names ${name}, which is not in the migrations directory. ` +
          `A rebuild that silently drops a declared step is not a rebuild.`
      )
      process.exit(1)
    }
    if (!reasoned(EXTRA_BACKFILLS[name])) {
      console.error(`EXTRA_BACKFILLS[${name}] has no reason`)
      process.exit(1)
    }
  }

  if (!backfillFiles.length) {
    console.error('no backfill migrations found')
    process.exit(1)
  }
  console.log(`backfills: ${backfillFiles.join(', ')}`)

  const backfill = backfillFiles
    .map((f) => rename(fs.readFileSync(path.join(dir, f), 'utf8')))
    .join('\n;\n')

  await client.query('BEGIN')

  console.log('building an empty schema...')
  await client.query(ddl)

  const empty = await client.query(`SELECT count(*)::int n FROM ${PREFIX}products.bullion`)
  if (empty.rows[0].n !== 0) {
    console.error('the scratch schema is not empty; the comparison would be meaningless')
    process.exit(1)
  }

  console.log('backfilling it from exchange...')
  await client.query(backfill)

  const totals = { compared: 0, nativeOnly: 0, absentInDev: 0, minted: 0, drift: 0, declined: 0 }
  const scoped = []
  const drifted = []
  const declined = []

  for (const t of PREPARED) {
    const [live, built, population, minted] = [
      await rowsOf('', t),
      await rowsOf(PREFIX, t),
      await populationOf(t),
      await mintedOf(t),
    ]
    const { fail, bucket } = diffTable(t, live, built, population, minted)
    const cap = SHOW_ALL ? fail.length : 4
    for (const f of fail.slice(0, cap)) note(f)
    if (fail.length > cap) note(`${t.name}: ...and ${fail.length - cap} more`)

    for (const k of Object.keys(totals)) totals[k] += bucket[k]
    if (bucket.nativeOnly || bucket.absentInDev || bucket.minted) {
      scoped.push(
        `${t.name.padEnd(30)} ${bucket.nativeOnly} written natively, ` +
          `${bucket.absentInDev} absent in dev, ${bucket.minted} minted with a generated id`
      )
    }
    if (bucket.drift) {
      drifted.push(
        `${t.name.padEnd(30)} ${bucket.drift} on ${[...bucket.driftCols].sort().join(', ')}`
      )
    }
    if (bucket.declined) {
      declined.push(
        `${t.name.padEnd(30)} ${bucket.declined} on ${[...bucket.declinedCols].sort().join(', ')}`
      )
    }
    if (!fail.length) {
      const aside =
        bucket.nativeOnly || bucket.absentInDev || bucket.minted
          ? ` (+${bucket.nativeOnly} native, ${bucket.absentInDev} absent, ${bucket.minted} minted)`
          : ''
      console.log(`  ok    ${t.name.padEnd(30)} ${bucket.compared} rows${aside}`)
    }
  }

  const { rows: populated } = await client.query(
    `SELECT n.nspname || '.' || c.relname AS name
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = ANY($1)
     ORDER BY 1`,
    [SCHEMAS]
  )
  const registered = new Set(TABLES.map((t) => t.name))
  for (const { name } of populated) {
    const {
      rows: [{ n }],
    } = await client.query(`SELECT count(*)::int n FROM ${name}`)
    if (n === 0 || registered.has(name)) continue
    const declared = NOT_REBUILT[name]
    if (!declared) {
      note(
        `${name} holds ${n} rows, is not registered in TABLES, and is not declared in NOT_REBUILT - ` +
          `so nothing checks that it can be rebuilt from exchange`
      )
      continue
    }
    const why = typeof declared === 'string' ? declared : declared.why
    if (!reasoned(why)) {
      note(`${name} is declared in NOT_REBUILT with no reason`)
      continue
    }
    if (declared.exchangeRows) {
      const {
        rows: [{ n: found }],
      } = await client.query(declared.exchangeRows.sql)
      if (found !== declared.exchangeRows.equals) {
        note(
          `${name}: its NOT_REBUILT entry pins ${declared.exchangeRows.equals} exchange row(s) and there are now ` +
            `${found} - re-read the entry, the reason it gives may no longer hold`
        )
      }
    }
  }

  console.log('\nre-running to confirm it is idempotent...')
  const before = []
  for (const t of PREPARED) before.push(await rowsOf(PREFIX, t))
  await client.query(backfill)
  const after = []
  for (const t of PREPARED) after.push(await rowsOf(PREFIX, t))
  PREPARED.forEach((t, i) => {
    if (before[i].size !== after[i].size) {
      note(`${t.name}: re-running changed the row count, ${before[i].size} -> ${after[i].size}`)
      return
    }
    for (const [k, row] of before[i]) {
      const other = after[i].get(k)
      if (!other || t.labels.some((c) => row[c] !== other[c])) {
        note(`${t.name}: re-running changed the row at ${show(k)}`)
        return
      }
    }
  })

  // The population scoping above says dev legitimately holds rows exchange does
  // not. This says the BACKFILL still refuses to run into a schema in that
  // state. Different database - the scratch copy - and the opposite direction.
  console.log('confirming it refuses once exchange is no longer authoritative...')
  await client.query(
    `INSERT INTO ${PREFIX}leads.leads (id, name, created_at, updated_at, converted, contacted, responded)
     VALUES (gen_random_uuid(), 'written after the switch was promoted', now(), now(), false, false, false)`
  )
  let refused = false
  try {
    await client.query(backfill)
  } catch (err) {
    refused = /refusing to backfill/.test(err.message)
    if (!refused) throw err
  }
  if (!refused) note('the backfill ran even though the new schema held a row exchange does not')
  else console.log('  ok    refused, naming leads.leads')

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `\ncompared ${PREPARED.length} tables and ${totals.compared} rows in ${secs}s\n` +
      `out of scope: ${totals.nativeOnly} written natively after the pivot, ` +
      `${totals.absentInDev} that exchange holds and dev no longer does, ` +
      `${totals.minted} minted by the rebuild with a generated id\n` +
      `declared: ${totals.drift} value(s) on columns native code owns, ` +
      `${totals.declined} the rebuild deliberately does not reproduce`
  )
  for (const s of scoped) console.log(`  scope   ${s}`)
  for (const s of drifted) console.log(`  drift   ${s}`)
  for (const s of declined) console.log(`  decline ${s}`)
  console.log(failures ? `\n${failures} undeclared difference(s)` : `\nno undeclared differences`)
} finally {
  await client.query('ROLLBACK')
  client.release()
  await pool.end()
}

process.exit(failures ? 1 : 0)
