import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sqlFrom } from '#shared/db/sql.ts'
import { missingFor } from '#logistics/fulfillments/rules.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { PATCHABLE } from '#db/fulfillments/repo.ts'
import { PATCHABLE as METHOD_PATCHABLE } from '#db/fulfillments/methods/repo.ts'
import { PATCHABLE as PICKUP_PATCHABLE } from '#db/fulfillments/pickups/repo.ts'
import { PATCHABLE as DIRECT_PATCHABLE } from '#db/fulfillments/directs/repo.ts'
import { PATCHABLE as LINK_PATCHABLE } from '#db/fulfillments/shipments/repo.ts'

const builtFulfillment = () =>
  buildUpdate({
    table: 'fulfillments.fulfillments',
    allowed: PATCHABLE,
    patch: { status: 'COMPLETED', method_id: 'm' },
    where: { id: 'x' },
  })!.text

const builtMethod = () =>
  buildUpdate({
    table: 'fulfillments.methods',
    allowed: METHOD_PATCHABLE,
    patch: Object.fromEntries(METHOD_PATCHABLE.map((c) => [c as string, null])),
    where: { id: 'x' },
  })!.text

const builtPickup = () =>
  buildUpdate({
    table: 'fulfillments.pickups',
    allowed: PICKUP_PATCHABLE,
    patch: { pickup_address_id: 'a' },
    where: { fulfillment_id: 'f1' },
  })!.text

const builtDirect = () =>
  buildUpdate({
    table: 'fulfillments.directs',
    allowed: DIRECT_PATCHABLE,
    patch: { location_id: 'l' },
    where: { fulfillment_id: 'f1' },
  })!.text

const builtLink = () =>
  buildUpdate({
    table: 'fulfillments.shipments',
    allowed: LINK_PATCHABLE,
    patch: { recipient_location_id: 'r' },
    where: { shipment_id: 's1' },
  })!.text

const here = new URL('../../../../db/fulfillments/', import.meta.url).pathname
const sql = sqlFrom(here)
const methodsSql = sqlFrom(`${here}/methods`)
const pickupsSql = sqlFrom(`${here}/pickups`)
const directsSql = sqlFrom(`${here}/directs`)
const linksSql = sqlFrom(`${here}/shipments`)

const strip = (text: string): string =>
  text
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')

test('every statement loads and is not empty', () => {
  for (const n of ['get_one', 'get_by_order', 'get_many', 'create', 'view']) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`)
  }
  for (const n of ['get_available', 'get_all', 'get_one', 'get_default']) {
    assert.ok(methodsSql(n).trim().length > 0, `methods/${n} is empty`)
  }
  assert.ok(builtFulfillment().trim().length > 0, 'the built fulfillments UPDATE is empty')
  assert.ok(builtMethod().trim().length > 0, 'the built methods UPDATE is empty')
  for (const n of ['get_for', 'get_many', 'create', 'delete']) {
    assert.ok(pickupsSql(n).trim().length > 0, `pickups/${n} is empty`)
    assert.ok(directsSql(n).trim().length > 0, `directs/${n} is empty`)
  }
  assert.ok(builtPickup().trim().length > 0, 'the built pickups UPDATE is empty')
  assert.ok(builtDirect().trim().length > 0, 'the built directs UPDATE is empty')
  for (const n of ['get_for', 'get_by_shipment', 'exists_for', 'create', 'upsert']) {
    assert.ok(linksSql(n).trim().length > 0, `shipments/${n} is empty`)
  }
  assert.ok(builtLink().trim().length > 0, 'the built shipments UPDATE is empty')
})

test('no statement joins a second table', () => {
  const all: [string, string][] = [
    ...['get_one', 'get_by_order', 'get_many', 'create'].map(
      (n) => [`fulfillments/${n}`, sql(n)] as [string, string]
    ),
    ...['get_available', 'get_all', 'get_one', 'get_default'].map(
      (n) => [`methods/${n}`, methodsSql(n)] as [string, string]
    ),
    ['fulfillments/update', builtFulfillment()] as [string, string],
    ['methods/update', builtMethod()] as [string, string],
    ...['get_for', 'get_many', 'create', 'delete'].flatMap((n) => [
      [`pickups/${n}`, pickupsSql(n)] as [string, string],
      [`directs/${n}`, directsSql(n)] as [string, string],
    ]),
    ['pickups/update', builtPickup()] as [string, string],
    ['directs/update', builtDirect()] as [string, string],
    // `shipments/get_for` is deliberately absent: it joins shipping.shipments to
    // put the HANDOVER leg first, because ordering the links by their own random
    // uuid picked a return leg about half the time (LD F3).
    ...['get_by_shipment', 'exists_for', 'create', 'upsert'].map(
      (n) => [`shipments/${n}`, linksSql(n)] as [string, string]
    ),
    ['shipments/update', builtLink()] as [string, string],
  ]

  assert.ok(all.length >= 23, `only ${all.length} statements found - the walk broke`)
  for (const [name, text] of all) {
    assert.doesNotMatch(strip(text), /\bJOIN\b/i, `${name} joins a second table`)
  }
})

test('the links read orders the handover leg ahead of a return', () => {
  const text = strip(linksSql('get_for'))
  assert.match(text, /JOIN shipping\.shipments/, 'get_for does not reach the leg it orders by')
  assert.match(text, /direction = 'Return'/, 'get_for does not sort a return leg last')
  assert.doesNotMatch(
    text,
    /ORDER BY\s+(fs\.)?id ASC\s*$/,
    'get_for is back to ordering by the link row id, which is a random uuid'
  )
})

test('the direction cast is schema-qualified', () => {
  for (const n of ['get_available', 'get_default']) {
    assert.match(
      strip(methodsSql(n)),
      /\$1::orders\.direction/,
      `methods/${n} casts direction without naming the schema`
    )
  }
})

test('methods offers no way to invent a category', () => {
  for (const n of ['get_available', 'get_all', 'get_one', 'get_default']) {
    assert.doesNotMatch(
      strip(methodsSql(n)),
      /INSERT INTO|DELETE FROM/i,
      `methods/${n} creates or deletes a method`
    )
  }
  assert.doesNotMatch(
    builtMethod(),
    /INSERT INTO|DELETE FROM/i,
    'methods/update creates or deletes a method'
  )
})

test('the method update is partial, not a full overwrite', () => {
  const one = buildUpdate({
    table: 'fulfillments.methods',
    allowed: METHOD_PATCHABLE,
    patch: { hidden: true },
    where: { id: 'x' },
  })!
  assert.match(one.text, /SET hidden = \$1\b/)
  for (const col of ['label', 'admin_label', 'enabled']) {
    assert.doesNotMatch(
      one.text,
      new RegExp(`\\b${col}\\b`),
      `methods/update touches ${col} on a patch that never named it`
    )
  }

  for (const col of ['type', 'category', 'direction']) {
    assert.doesNotMatch(
      builtMethod(),
      new RegExp(`\\b${col}\\s*=`, 'i'),
      `methods/update writes ${col}, which the code dispatches on`
    )
    assert.throws(
      () =>
        buildUpdate({
          table: 'fulfillments.methods',
          allowed: METHOD_PATCHABLE,
          patch: { [col]: 'x' },
          where: { id: 'x' },
        }),
      /is not a patchable column/,
      `${col} is patchable`
    )
  }
})

test('pickups, directs and shipments create with no conflict handling', () => {
  for (const [what, text] of [
    ['pickups', strip(pickupsSql('create'))],
    ['directs', strip(directsSql('create'))],
    ['shipments', strip(linksSql('create'))],
  ] as const) {
    assert.doesNotMatch(text, /ON CONFLICT/i, `${what}/create still upserts`)
  }
})

test('pickups/directs update key on fulfillment_id, shipments on shipment_id', () => {
  assert.match(builtPickup(), /WHERE fulfillment_id = \$2/)
  assert.match(builtDirect(), /WHERE fulfillment_id = \$2/)
  assert.match(builtLink(), /WHERE shipment_id = \$2/)
})

test('creating a fulfillment for an order that has one does nothing', () => {
  assert.match(strip(sql('create')), /ON CONFLICT \(order_id\) DO NOTHING/i)
})

test('the fulfillment view is one read that nests every child by its table', () => {
  const view = strip(sql('view'))
  assert.match(view, /JOIN fulfillments\.methods/, 'the method is not joined')
  assert.match(view, /fulfillments\.pickups/, 'the pickup is not read')
  assert.match(view, /fulfillments\.directs/, 'the direct is not read')
  assert.match(view, /jsonb_agg/, 'the shipment links are not nested')
  assert.match(view, /shipping\.shipments/, 'the parcel is not read')
  assert.match(view, /ORDER BY COALESCE/, "the schedule order is not the view's")
})

// LD F7. A sale's parcel is created Outbound, so the first statement of the
// SHIPMENT branch returned an empty `missing` the moment the draft existed and
// `carrier_service_id` was never demanded - `sale_quote.sql` INNER JOINs
// shipping.services, so a null service prices the customer's delivery at zero.
const aSaleParcel = (carrier_service_id: string | null) =>
  ({
    method: { category: 'SHIPMENT', type: 'CARRIER DROPOFF' },
    parcel: {
      direction: 'Outbound',
      shipper_address_id: null,
      package_id: null,
      carrier_service_id,
      pickup_date: null,
      pickup_time: null,
    },
    pickup: null,
    direct: null,
  }) as unknown as Parameters<typeof missingFor>[0]

test("a sale's outbound parcel still owes its delivery service", () => {
  assert.deepEqual(missingFor(aSaleParcel(null), []), ['carrier_service_id'])
  assert.deepEqual(missingFor(aSaleParcel('0e4c8a12-0000-0000-0000-000000000001'), []), [])
})
