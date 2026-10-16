import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as lotSources from '#db/inventory/lot-sources/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('a sale line names the stock lot it was minted from; a purchase line names none', async () => {
  await inPinnedTransaction(
    async (c) => {
      const bought = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(2)
      const sold = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)
      await lotSources.link(sold.lots[0]!.lot_id, bought.lots[1]!.lot_id, 'sale', c)

      const purchaseLines = await orderLots.viewFor(bought.id, c)
      assert.deepEqual(
        purchaseLines.map((l) => l.source_reference),
        [null, null]
      )
      const stock = purchaseLines.find((l) => l.lot_id === bought.lots[1]!.lot_id)!
      assert.match(stock.lot.reference ?? '', new RegExp(`^Lot ${bought.number}-[AB]$`))

      const [line] = await orderLots.viewFor(sold.id, c)
      assert.equal(line!.source_reference, stock.lot.reference)

      const view = await ordersRepo.view(sold.id, c)
      assert.equal(view!.lots[0]!.source_reference, stock.lot.reference)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})
