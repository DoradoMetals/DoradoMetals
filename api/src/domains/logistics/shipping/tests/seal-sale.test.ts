import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aCart, aProduct, aShipment, aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as pricing from '#pricing/index.ts'
import * as shipmentsRepo from '#db/shipping/shipments/repo.ts'
import * as labels from '#logistics/shipping/labels.ts'

afterAll(async () => {
  await pool.end()
})

test('a sale parcel is sealed insured for the goods value of its basket', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 1, ask_premium: 1 })
      const cart = await aCart(c, user, { direction: 'sale' }).withBullion(product, 1)
      const order = await anOrder(c, user, { direction: 'sale' })
      const shipment = await aShipment(c, order, {
        insured: false,
        declared_value: null,
        pickup_type: null,
      })

      const quote = await pricing.priceCheckout(cart.id, c)
      assert.equal(quote.direction, 'sale')
      assert.ok(quote.item_total > 0, 'fixture: the basket priced above zero')

      await labels.sealForPlacement(shipment.id, cart.id, null, c)

      const sealed = await shipmentsRepo.getOne(shipment.id, c)
      assert.equal(sealed?.insured, true, 'the sale parcel shipped uninsured')
      assert.ok(sealed?.declared_value && sealed.declared_value > 0)
      assert.ok(sealed.declared_value <= quote.item_total)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES] }
  )
})
