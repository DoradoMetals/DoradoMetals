import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aProduct, aUser, anAdmin } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

const CART_LOCK = LOCKS.ORDERS

type Caller = { id: string; name: string | null; email: string | null; role: string }
const asCaller = (u: { id: string; name: string | null; email: string | null }): Caller => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: 'user',
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const products = async (c: PoolClient) => ({
  live: await aProduct(c, { display: true }),
  hidden: await aProduct(c, { display: false }),
})

const put = (direction: string, lots: unknown[], user_id?: string) =>
  request(app)
    .put('/api/checkout/lots')
    .query(user_id ? { direction, user_id } : { direction })
    .send({ lots })

const get = (direction: string, user_id?: string) =>
  request(app)
    .get('/api/checkout/lots')
    .query(user_id ? { direction, user_id } : { direction })

const rowsOf = async (c: PoolClient, user_id: string, direction: string) => {
  const { rows } = await c.query(
    `SELECT i.bullion_id, i.metal_id, i.pre_melt, i.post_melt, i.purity,
            i.content, i.unit, i.quantity
       FROM checkout.lots cl
       JOIN inventory.lots i ON i.id = cl.lot_id
       JOIN checkout.checkouts c ON c.id = cl.checkout_id
      WHERE c.user_id = $1 AND c.direction = $2
      ORDER BY cl.created_at, cl.id`,
    [user_id, direction]
  )
  return rows
}

test('PUT replaces the basket and answers what is now in it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      await as(customer, async () => {
        const first = await put('sale', [{ bullion_id: live.id, quantity: 3 }])
        assert.equal(first.status, 200, `answered ${first.status}: ${JSON.stringify(first.body)}`)
        assert.ok(Array.isArray(first.body), 'the sync did not answer the basket')
        assert.equal(first.body.length, 1)
        assert.equal(first.body[0].bullion_id, live.id)
        assert.equal(Number(first.body[0].quantity), 3)

        const second = await put('sale', [{ bullion_id: live.id, quantity: 1 }])
        assert.equal(second.status, 200)
        const rows = await rowsOf(c, customer.id, 'sale')
        assert.equal(rows.length, 1, 'the second sync added a line instead of replacing')
        assert.equal(Number(rows[0].quantity), 1, 'the basket kept the first quantity')
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('GET answers the rows PUT stored, per direction', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      const metal_id = 'Gold'
      await as(customer, async () => {
        await put('sale', [{ bullion_id: live.id, quantity: 2 }])
        await put('purchase', [{ metal_id, pre_melt: 10, purity: 0.925, unit: 'g', quantity: 1 }])

        const sale = await get('sale')
        assert.equal(sale.status, 200)
        assert.equal(sale.body.length, 1, 'the buy basket did not come back')
        assert.equal(sale.body[0].bullion_id, live.id)

        const purchase = await get('purchase')
        assert.equal(purchase.status, 200)
        assert.equal(purchase.body.length, 1, 'the sell basket did not come back')
        assert.equal(
          purchase.body[0].bullion_id,
          null,
          "the two directions' baskets are not separate sessions"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('DELETE empties one direction and leaves the other alone', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      const metal_id = 'Gold'
      await as(customer, async () => {
        await put('sale', [{ bullion_id: live.id, quantity: 1 }])
        await put('purchase', [{ metal_id, pre_melt: 10, purity: 0.925, unit: 'g', quantity: 1 }])

        const res = await request(app).delete('/api/checkout/lots').query({ direction: 'sale' })
        assert.equal(res.status, 200, `answered ${res.status}: ${res.text}`)
        assert.equal(res.body.removed, 1, 'the delete did not say how many lines went')

        assert.equal((await rowsOf(c, customer.id, 'sale')).length, 0, 'the buy basket survived')
        assert.equal(
          (await rowsOf(c, customer.id, 'purchase')).length,
          1,
          'emptying one direction emptied the other'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('GET answers an empty list for a customer with no session', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      await as(customer, async () => {
        const res = await get('purchase')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body, [])
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test("a bullion line inherits the product's metal, weights, purity and content", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const product = await aProduct(c, {
        display: true,
        gross: 1.0909,
        content: 1,
        purity: 0.9167,
        ask_premium: 1.05,
      })
      await as(customer, async () => {
        const res = await put('sale', [{ bullion_id: product.id, quantity: 2 }])
        assert.equal(res.status, 200, JSON.stringify(res.body))

        const [row] = await rowsOf(c, customer.id, 'sale')
        assert.equal(row.metal_id, product.metal_id, 'the line did not inherit the metal')
        assert.equal(Number(row.pre_melt), Number(product.gross))
        assert.equal(row.post_melt, null, 'a coin is not melted (MP F1)')
        assert.equal(Number(row.purity), Number(product.purity))
        assert.equal(Number(row.content), Number(product.content))
        assert.equal(row.unit, 't oz')
        assert.ok(!('premium' in row), 'a basket lot carries a premium again')
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('editing the product afterwards does not change the line already in the basket', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const product = await aProduct(c, {
        display: true,
        gross: 1,
        content: 1,
        purity: 0.999,
        ask_premium: 1.05,
      })
      await as(customer, async () => {
        await put('sale', [{ bullion_id: product.id, quantity: 1 }])
        const before = (await rowsOf(c, customer.id, 'sale'))[0]

        await c.query(
          `UPDATE products.bullion SET content = 500, gross = 500, purity = 0.5 WHERE id = $1`,
          [product.id]
        )

        const after = (await rowsOf(c, customer.id, 'sale'))[0]
        assert.equal(
          Number(after.content),
          Number(before.content),
          'a catalogue edit repriced the basket'
        )
        assert.equal(Number(after.pre_melt), Number(before.pre_melt))
        assert.equal(Number(after.purity), Number(before.purity))

        const read = await get('sale')
        assert.equal(Number(read.body[0].content), Number(before.content))
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test("a purchase bullion line's premium is not the product's bid premium", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const product = await aProduct(c, { bid_premium: 0.42, metal_id: 'Gold', content: 1 })
      await as(customer, async () => {
        const res = await put('purchase', [{ bullion_id: product.id, quantity: 1 }])
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const [row] = await rowsOf(c, customer.id, 'purchase')
        assert.notEqual(
          Number(row.premium),
          0.42,
          "the sell basket copied the product's bid premium instead of reading the rate band"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('a line with no product carries its own values and a derived content', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const metal_id = 'Gold'
      await as(customer, async () => {
        const res = await put('purchase', [
          { metal_id, pre_melt: 8, purity: 0.5, unit: 't oz', quantity: 1 },
        ])
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const [row] = await rowsOf(c, customer.id, 'purchase')
        assert.equal(row.bullion_id, null)
        assert.equal(Number(row.pre_melt), 8)
        assert.equal(Number(row.purity), 0.5)
        assert.equal(Number(row.content), 4, 'content is not weight in troy ounces times purity')
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('the buy basket refuses a product that is not displayed', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live, hidden } = await products(c)
      await as(customer, async () => {
        await put('sale', [{ bullion_id: live.id, quantity: 1 }])
        const before = await rowsOf(c, customer.id, 'sale')

        const res = await put('sale', [{ bullion_id: hidden.id, quantity: 1 }])
        assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.deepEqual(
          await rowsOf(c, customer.id, 'sale'),
          before,
          'a refused sync changed the basket'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('one bad line refuses the whole sync, and nothing is written', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live, hidden } = await products(c)
      await as(customer, async () => {
        const before = await rowsOf(c, customer.id, 'sale')
        const res = await put('sale', [
          { bullion_id: live.id, quantity: 2 },
          { bullion_id: hidden.id, quantity: 1 },
        ])
        assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.deepEqual(
          await rowsOf(c, customer.id, 'sale'),
          before,
          'the good line was written even though the sync was refused'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('an id that names no product is refused in either direction', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      await as(customer, async () => {
        for (const direction of ['sale', 'purchase']) {
          const res = await put(direction, [{ bullion_id: randomUUID(), quantity: 1 }])
          assert.equal(
            res.status,
            422,
            `${direction} answered ${res.status}: ${JSON.stringify(res.body)}`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('the sell basket accepts a product the buy side hides', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { hidden } = await products(c)
      await as(customer, async () => {
        const res = await put('purchase', [{ bullion_id: hidden.id, quantity: 1 }])
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        const [row] = await rowsOf(c, customer.id, 'purchase')
        assert.equal(row.bullion_id, hidden.id)
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('a line with no product is refused at the boundary when a value is missing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const metal_id = 'Gold'
      const complete = { metal_id, pre_melt: 8, purity: 0.5, unit: 't oz', quantity: 1 }
      await as(customer, async () => {
        for (const missing of ['metal_id', 'pre_melt', 'purity', 'unit'] as const) {
          const line: Record<string, unknown> = { ...complete }
          delete line[missing]
          const res = await put('purchase', [line])
          assert.equal(
            res.status,
            400,
            `a line with no ${missing} answered ${res.status}: ${JSON.stringify(res.body)}`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('the buy basket refuses a line with no product', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const metal_id = 'Gold'
      await as(customer, async () => {
        const res = await put('sale', [
          { metal_id, pre_melt: 8, purity: 0.5, unit: 't oz', quantity: 1 },
        ])
        assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('a bullion line carrying a weight of its own is refused at the boundary', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      await as(customer, async () => {
        for (const weights of [{ purity: 0.1 }, { pre_melt: 8 }, { post_melt: 8 }, { unit: 'g' }]) {
          const res = await put('sale', [{ bullion_id: live.id, quantity: 1, ...weights }])
          assert.equal(
            res.status,
            400,
            `${JSON.stringify(weights)} answered ${res.status}: ${JSON.stringify(res.body)}`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('a bullion line naming a metal of its own is refused at the boundary', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      await as(customer, async () => {
        const res = await put('sale', [{ bullion_id: live.id, metal_id: 'Gold', quantity: 1 }])
        assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('a direction that is not one of the two labels is a 400', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      await as(customer, async () => {
        assert.equal((await get('sideways')).status, 400)
        assert.equal((await get('')).status, 400)
        assert.equal((await put('sideways', [])).status, 400)
        assert.equal(
          (await request(app).delete('/api/checkout/lots').query({ direction: 'sideways' })).status,
          400
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test('an unknown field in a line is a 400', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = asCaller(await aUser(c))
      const { live } = await products(c)
      await as(customer, async () => {
        const res = await put('sale', [{ bullion_id: live.id, quantity: 1, price: 5 }])
        assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})

test("an admin may read and replace a named customer's basket", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const admin = await anAdmin(c)
      const { live } = await products(c)

      await as({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, async () => {
        const res = await put('sale', [{ bullion_id: live.id, quantity: 4 }], customer.id)
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const read = await get('sale', customer.id)
        assert.equal(read.status, 200)
        assert.equal(read.body.length, 1, "the admin did not read the customer's basket back")
        assert.equal(Number(read.body[0].quantity), 4)
      })

      const rows = await rowsOf(c, customer.id, 'sale')
      assert.equal(rows.length, 1, "the admin's write did not land on the customer's session")
    },
    { actor: TEST_ACTOR.id, lock: CART_LOCK }
  )
})
