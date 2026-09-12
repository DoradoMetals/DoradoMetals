import { test } from 'vitest'
import assert from 'node:assert/strict'

import { CATALOGUE } from '#providers/fedex/adapters/fedex.catalogue.ts'
import { CATALOGUES } from '#logistics/shipping/operations/catalogues.ts'
import { PROVIDERS } from '#logistics/shipping/operations/registry.ts'
import { BUILDERS } from '#logistics/shipping/operations/builders.ts'

test('every carrier with a provider has builders and a catalogue', () => {
  for (const key of Object.keys(PROVIDERS)) {
    assert.ok(key in BUILDERS, `${key} has a provider but no builders`)
    assert.ok(key in CATALOGUES, `${key} has a provider but no catalogue`)
  }
})

test('handoff names are the values written to shipments.pickup_type', () => {
  const names = CATALOGUE.handoffs.map((h) => h.name)
  assert.deepEqual(names, ['Store Dropoff', 'Carrier Pickup'])
})

test('the catalogue offers exactly one schedulable handoff and one that is not', () => {
  const schedulable = CATALOGUE.handoffs.filter((h) => h.requires_schedule)
  const walkUp = CATALOGUE.handoffs.filter((h) => !h.requires_schedule)
  assert.equal(schedulable.length, 1, 'the pickup pick would be a coin toss')
  assert.equal(walkUp.length, 1, 'the dropoff pick would be a coin toss')
})

test('the handoff that books a courier is the one that requires scheduling', () => {
  const courier = CATALOGUE.handoffs.find((h) => h.name === 'Carrier Pickup')
  assert.ok(courier, 'the courier handoff is gone - features/orders/service.ts still books on it')
  assert.equal(courier.requires_schedule, true)
})

test('handoff codes are the values FedEx accepts as a pickupType', () => {
  const codes = CATALOGUE.handoffs.map((h) => h.code)
  assert.deepEqual(codes, ['DROPOFF_AT_FEDEX_LOCATION', 'CONTACT_FEDEX_TO_SCHEDULE'])
})

test('exactly one handoff is scheduled and exactly one has dropoff locations', () => {
  assert.equal(CATALOGUE.handoffs.filter((h) => h.requires_schedule).length, 1)
  assert.equal(CATALOGUE.handoffs.filter((h) => h.has_dropoff_locations).length, 1)
})

test('a handoff schedules or has dropoff locations, never both and never neither', () => {
  for (const h of CATALOGUE.handoffs) {
    assert.notEqual(
      h.requires_schedule,
      h.has_dropoff_locations,
      `${h.code} must do exactly one of the two`
    )
  }
})

test("service codes are what a rate quote's serviceType matches", () => {
  const codes = CATALOGUE.services.map((s) => s.code)
  assert.deepEqual(codes, ['FEDEX_EXPRESS_SAVER', 'PRIORITY_OVERNIGHT'])
})

test('every offered service carries the carrier code a pickup check needs', () => {
  for (const s of CATALOGUE.services) {
    assert.ok(s.carrier_code.length > 0, `${s.code} has no carrier_code`)
  }
})

test('display_order is dense and starts at zero on both lists', () => {
  for (const list of [CATALOGUE.handoffs, CATALOGUE.services]) {
    const orders = list.map((x) => x.display_order).sort((a, b) => a - b)
    assert.deepEqual(
      orders,
      list.map((_, i) => i)
    )
  }
})
