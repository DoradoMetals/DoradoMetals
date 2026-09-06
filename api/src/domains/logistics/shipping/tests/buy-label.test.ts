import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { mockSessions, restoreSessions } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aUser,
  anAddress,
  anOrder,
  packageId,
  carrierServiceId,
} from '#shared/testing/builders/index.ts'
import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'
import * as shipmentsRepo from '#db/shipping/shipments/repo.ts'
import * as servicesService from '#logistics/shipping/services/service.ts'
import * as lotsRepo from '#db/lots/items/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import { parcelWeightLb } from '#logistics/shipping/rules.ts'

await mockSessions()
const labels = await import('#logistics/shipping/labels.ts')

afterAll(async () => {
  await restoreSessions()
  await pool.end()
})

async function anUnlabelledParcel(c: PoolClient) {
  const seller = await aUser(c, { name: 'Buy Label Test Seller' })
  const address = await anAddress(c, seller)
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLots(1, { pre_melt: 20, unit: 'g' })
    .withAddress(address)
  const carrier_service_id = await carrierServiceId(c)
  const package_id = await packageId(c)

  const shipment = await shipmentService.create(order.id, 'Inbound', c)
  if (!shipment) throw new Error('fixture: the shipment shell was not created')
  await shipmentService.update(
    shipment.id,
    { package_id, carrier_service_id, pickup_type: 'Store Dropoff' },
    c
  )

  const box = await packagesRepo.getOne(package_id, c)
  const items = await lotsRepo.getByIds(
    (await orderLots.getFor(order.id, c)).map((row) => row.lot_id),
    c
  )
  return {
    order_id: order.id,
    shipment_id: shipment.id,
    expectedWeight: parcelWeightLb(items, box),
  }
}

test("the parcel's weight is computed from the order's own items and its box", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { expectedWeight } = await anUnlabelledParcel(c)
      assert.ok(expectedWeight > 0, 'fixture: the computed weight is not positive')
      assert.ok(expectedWeight >= 1, "the box's own minimum did not govern")
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a parcel that already has a label is refused before the carrier is asked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { shipment_id } = await anUnlabelledParcel(c)
      await shipmentService.update(shipment_id, { tracking_number: '794000000010' }, c)

      await assert.rejects(() => labels.buyLabel(shipment_id), /already has a label/)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a parcel with no service or box chosen is refused', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { shipment_id } = await anUnlabelledParcel(c)
      await shipmentService.update(shipment_id, { carrier_service_id: null }, c)

      await assert.rejects(() => labels.buyLabel(shipment_id), /no service or package chosen/)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('an unknown parcel is refused, not resolved off null', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(
        () => labels.buyLabel('00000000-0000-0000-0000-000000000000'),
        /no shipment/
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a claimed parcel refuses a second buy - a label cannot be bought twice', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { shipment_id } = await anUnlabelledParcel(c)

      const claimed = await shipmentsRepo.claimForLabel(shipment_id, c)
      assert.equal(claimed, true, 'the first buy could not claim the parcel')

      assert.equal(
        await shipmentsRepo.claimForLabel(shipment_id, c),
        false,
        'a second buy claimed the same parcel and would have paid for a second label'
      )
      await assert.rejects(() => labels.buyLabel(shipment_id), /already having a label bought/)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a shipment that already carries a tracking number cannot be claimed at all', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { shipment_id } = await anUnlabelledParcel(c)
      await shipmentService.update(shipment_id, { tracking_number: '794000000011' }, c)

      assert.equal(
        await shipmentsRepo.claimForLabel(shipment_id, c),
        false,
        'a parcel with a label was claimed for another one'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a return leg that already has a label is refused before the carrier is asked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { shipment_id } = await anUnlabelledParcel(c)
      await shipmentService.update(
        shipment_id,
        { direction: 'Return', tracking_number: '794000000012' },
        c
      )

      await assert.rejects(() => labels.buyReturnLabel(shipment_id), /already has a label/)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('two shipments cannot hold one carrier tracking number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const one = await anUnlabelledParcel(c)
      const two = await anUnlabelledParcel(c)
      await shipmentService.update(one.shipment_id, { tracking_number: '794000000013' }, c)

      await assert.rejects(
        () => shipmentService.update(two.shipment_id, { tracking_number: '794000000013' }, c),
        /shipments_tracking_number_unique/,
        'a bought label was recorded on two shipment rows'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the return leg is insured for what the customer declared, not for a total that is not priced yet', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order_id, shipment_id } = await anUnlabelledParcel(c)
      await shipmentService.update(shipment_id, { declared_value: 8000, insured: true }, c)

      const service = await servicesService.labelServiceFor(await carrierServiceId(c), c)
      const declared = await labels.returnDeclaredValue(order_id, null, service.code)

      assert.equal(declared, 8000, 'a cancel before pricing returned the metal uninsured')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
