import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aProduct, aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as orderLots from '#db/orders/lots/repo.ts'

afterAll(async () => {
  await pool.end()
})

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

test('a bullion lot is named for its product', async () => {
  await inRollback(async (c) => {
    const product = await aProduct(c)
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withBullion(
      product,
      2
    )
    const [lot] = await orderLots.viewFor(order.id, c)
    assert.equal(lot?.name, product.name)
  })
})

test('a scrap lot is named by its standard purity label and metal', async () => {
  await inRollback(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLines({
      metal_id: 'Gold',
      pre_melt: 10,
      purity: 0.5833,
      unit: 'g',
    })
    const [lot] = await orderLots.viewFor(order.id, c)
    assert.equal(lot?.name, '14K Gold')
  })
})

test('a lot far from every standard purity for its metal gets no label', async () => {
  await inRollback(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLines({
      metal_id: 'Silver',
      pre_melt: 10,
      purity: 0.059,
      unit: 'g',
    })
    const [lot] = await orderLots.viewFor(order.id, c)
    assert.equal(lot?.name, 'Silver')
  })
})

test('a lot with no purity is named by its metal alone', async () => {
  await inRollback(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLines({
      metal_id: 'Gold',
    })
    const [lot] = await orderLots.viewFor(order.id, c)
    assert.equal(lot?.name, 'Gold')
  })
})
