import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import * as orders from '#orders/service.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as refinerOrders from '#db/refiners/orders/repo.ts'
import * as refinerService from '#orders/refiners/service.ts'
import * as shipmentRepo from '#logistics/shipping/shipments/service.ts'
import { closeBrowser } from '#providers/pdfs/puppeteer.ts'
import type { Transport } from '#providers/emails/nodemailer.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, assertNothingEscaped } from '#shared/testing/pinned-pool.ts'
import {
  aUser,
  aProduct,
  anOrder,
  anAddress,
  refinerNamed,
  refinersByEmail,
} from '#shared/testing/builders/index.ts'

type SalesOrderFixture = { id: string; order_number: number }
type SupplierFixture = { id: string }
type Baseline = { order_sent: boolean | null; supplier_id: string | null; outbound: number }

type Built = { id: string; order_number: number }

const aSalesOrder = async (
  c: PoolClient,
  { address = true, sent = false, refiner = null as string | null } = {}
): Promise<Built> => {
  const owner = await aUser(c)
  const product = await aProduct(c)
  const plan = anOrder(c, owner, {
    direction: 'sale',
    status: sent ? 'In Transit' : 'Pending',
  })
    .withBullion(product, 1, { price: 2600 })
    .withTotals({ total: 2600, items: 2600 })
  const order = address ? await plan.withAddress(await anAddress(c, owner)) : await plan
  await c.query(`UPDATE orders.orders SET order_sent = $2 WHERE id = $1`, [order.id, sent])
  if (refiner) {
    await c.query(`INSERT INTO refiners.orders (order_id, refiner_id) VALUES ($1, $2)`, [
      order.id,
      refiner,
    ])
  }
  return { id: order.id, order_number: order.number }
}

afterAll(async () => {
  await closeBrowser()
  await pool.end()
})

type Message = Parameters<Transport['sendMail']>[0]

function recorder(): Transport & { sent: Message[] } {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (message: Message) => {
      sent.push(message)
      return { messageId: 'recorded', accepted: [message.to] }
    },
  }
}

const state = async (id: string) => {
  const { rows } = await query(
    `SELECT so.order_sent,
            (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = so.id) AS supplier_id,
            (SELECT count(*)::int FROM shipping.shipments s
              JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
              JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
              WHERE f.order_id = so.id AND s.direction = 'Outbound') AS outbound
       FROM orders.orders so WHERE so.id = $1`,
    [id]
  )
  return rows[0]
}

test('an order with no address is refused, and nothing is written', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const addressless = await aSalesOrder(c, { address: false })
      const supplier = { id: await refinerNamed(c, 'Elemetal') }
      const before = await state(addressless.id)

      const mail = recorder()
      await assert.rejects(
        () => orders.sendToRefiner(addressless.id, supplier.id, mail),
        /has no address/,
        'an order with no address was accepted'
      )

      assert.equal(mail.sent.length, 0, 'a message was sent for an order with no address')

      const after = await state(addressless.id)
      assert.deepEqual(
        after,
        before,
        'the refusal still attached a supplier, created a shipment or set order_sent'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('those three writes are visible to the assertion that says they did not happen', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const withAddress = await aSalesOrder(client)
      const supplier = { id: await refinerNamed(client, 'Elemetal') }
      const before = await state(withAddress.id)

      const engagementId = await refinerService.engagementIdFor(withAddress.id, client)
      await refinerOrders.update(engagementId, { refiner_id: supplier.id }, client)
      await shipmentRepo.create(withAddress.id, 'Outbound', client)
      await ordersRepo.update(withAddress.id, { order_sent: true }, {}, client)

      const after = await state(withAddress.id)
      assert.equal(after.order_sent, true, 'order_sent was not observed')
      assert.equal(after.supplier_id, supplier.id, 'the supplier was not observed')
      assert.equal(after.outbound, before.outbound + 1, 'the outbound shipment was not observed')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('nothing this file did survived the transaction', async () => {
  let built = ''
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aSalesOrder(c)
      built = order.id
      const supplier = { id: await refinerNamed(c, 'Elemetal') }
      const engagementId = await refinerService.engagementIdFor(order.id, c)
      await refinerOrders.update(engagementId, { refiner_id: supplier.id }, c)
      await shipmentRepo.create(order.id, 'Outbound', c)
      await ordersRepo.update(order.id, { order_sent: true }, {}, c)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )

  assert.equal(
    await assertNothingEscaped(
      'shipping.shipments s JOIN fulfillments.shipments fs ON fs.shipment_id = s.id ' +
        'JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id',
      "f.order_id = $1 AND s.direction = 'Outbound'",
      [built]
    ),
    0,
    'an outbound shipment was committed to the database'
  )
  assert.equal(
    await assertNothingEscaped('orders.orders', 'id = $1', [built]),
    0,
    'the built sales order itself was committed'
  )
})

test('a sent order cannot be moved to a different refiner', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { withEmail, withoutEmail } = await refinersByEmail(client)
      const built = await aSalesOrder(client, { sent: true, refiner: withEmail })
      const order = { ...built, supplier_id: withEmail }
      const other = { id: withoutEmail }

      await assert.rejects(
        () => orders.sendToRefiner(order.id, other.id),
        (err: unknown) => {
          const e = err as { kind?: string; message?: string }
          assert.equal(e.kind, 'conflict', `expected a conflict, got ${e.kind}`)
          assert.match(String(e.message), /already been sent/)
          return true
        }
      )

      const after = (
        await client.query(
          `SELECT refiner_id AS supplier_id FROM refiners.orders WHERE order_id = $1`,
          [order.id]
        )
      ).rows[0]
      assert.equal(after.supplier_id, order.supplier_id, 'the refiner was changed anyway')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('re-sending to the same refiner writes nothing new', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { withEmail } = await refinersByEmail(client)
      const built = await aSalesOrder(client, { sent: true, refiner: withEmail })
      const order = { ...built, supplier_id: withEmail }

      const before = Number(
        (
          await client.query(
            `SELECT count(*)::int n FROM shipping.shipments s
             JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1 AND s.direction = 'Outbound'`,
            [order.id]
          )
        ).rows[0].n
      )

      const sent: unknown[] = []
      await orders.sendToRefiner(order.id, order.supplier_id, {
        sendMail: async (m) => {
          sent.push(m)
          return { messageId: 'test' }
        },
      })

      const after = Number(
        (
          await client.query(
            `SELECT count(*)::int n FROM shipping.shipments s
             JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1 AND s.direction = 'Outbound'`,
            [order.id]
          )
        ).rows[0].n
      )
      assert.equal(after, before, 'a resend created another outbound shipment')
      assert.equal(sent.length, 1, 'the resend did not send the refiner their copy')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test("the refiner's copy goes to the organization's address, not a field that does not exist", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await aSalesOrder(client)
      const withEmail = { id: (await refinersByEmail(client)).withEmail }

      const sent: Message[] = []
      await orders.sendToRefiner(order.id, withEmail.id, {
        sendMail: async (m: Message) => {
          sent.push(m)
          return { messageId: 'test' }
        },
      })

      assert.equal(sent.length, 1, 'the refiner was not sent their copy')
      assert.ok(sent[0].to, `the recipient was ${JSON.stringify(sent[0].to)}`)
      assert.match(String(sent[0].to), /@/, 'the recipient is not an address')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a refiner with no email is refused before anything is written', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await aSalesOrder(client)
      const noEmail = { id: (await refinersByEmail(client)).withoutEmail }

      await assert.rejects(
        () =>
          orders.sendToRefiner(order.id, noEmail.id, {
            sendMail: async () => {
              throw new Error('must not be reached')
            },
          }),
        (err: unknown) => {
          const e = err as { kind?: string; message?: string }
          assert.equal(e.kind, 'invalid', `expected an invalid refusal, got ${e.kind}`)
          assert.match(String(e.message), /no email address/)
          return true
        }
      )

      const after = (
        await client.query(
          `SELECT o.order_sent,
                (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = o.id) AS supplier_id
           FROM orders.orders o WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0]
      assert.equal(after.order_sent, false, 'the order was marked sent anyway')
      assert.equal(after.supplier_id, null, 'the refiner was attached anyway')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
