import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import * as details from '#db/payments/details/repo.ts'
import * as methods from '#db/payments/methods/repo.ts'
import * as transactions from '#db/orders/transactions/repo.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aPayout, aUser, anOrder } from '#shared/testing/builders/index.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})
afterAll(async () => {
  await pool.end()
})

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const methodId = async (c: PoolClient, type: string) => {
  const row = await methods.findByType('purchase', type, c)
  assert.ok(row, `the payment methods seed has no purchase ${type}`)
  return row!.id
}

const anAccount = async (c: PoolClient, type = 'ECHECK') =>
  await details.create(
    (await aUser(c)).id,
    { method_id: await methodId(c, type), account_holder: 'A Customer', email_to: 'a@b.co' },
    c
  )

test('an account is created with the method the caller resolved', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    assert.equal(row.account_holder, 'A Customer')
    assert.equal(row.email_to, 'a@b.co')
    assert.equal(row.method_id, await methodId(c, 'ECHECK'))

    const read = await details.getOne(row.id, c)
    assert.equal(read?.id, row.id)
    assert.ok((await details.listFor(row.user_id, c)).some((r) => r.id === row.id))
  })
})

test('the account write never stores routing or account numbers', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await details.create(
      (await aUser(c)).id,
      {
        method_id: await methodId(c, 'ACH'),
        account_holder: 'A Customer',
        last_four: '6789',
        routing_last_four: '4321',
      },
      c
    )
    const {
      rows: [stored],
    } = await c.query(
      'SELECT routing_number, account_number, last_four FROM payments.details WHERE id = $1',
      [row.id]
    )
    assert.equal(stored.routing_number, null, 'a routing number reached payments.details')
    assert.equal(stored.account_number, null, 'an account number reached payments.details')
    assert.equal(stored.last_four, '6789', 'last_four is safe and should be kept')
  })
})

test('update answers the written row, and undefined for an id with no account', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    const wire = await methodId(c, 'WIRE')

    const written = await details.update(row.id, { method_id: wire }, c)
    assert.equal(written?.method_id, wire)
    assert.equal(written?.account_holder, 'A Customer', 'an unnamed column was overwritten')

    assert.equal(await details.update(randomUUID(), { method_id: wire }, c), undefined)
  })
})

test('the row a write answers carries no bank number and no envelope', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    const written = await details.update(row.id, { bank_name: 'A Bank', last_four: '6789' }, c)
    const leaked = Object.keys(written ?? {}).filter((k) => /number|encrypt/.test(k))
    assert.deepEqual(leaked, [], `a write answered with ${leaked.join(', ')}`)
    assert.equal(written?.last_four, '6789', 'the last four are not a secret and are the answer')
    assert.equal(written?.bank_name, 'A Bank')
  })
})

test('an explicit null CLEARS a column, and an absent key leaves it', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    await details.update(row.id, { email_to: null }, c)
    const after = await details.getOne(row.id, c)
    assert.equal(after?.email_to, null, 'an explicit null did not clear the column')
    assert.equal(after?.account_holder, 'A Customer', 'an absent key cleared a column')
  })
})

test('remove answers true once and false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    assert.equal(await details.remove(row.id, c), true)
    assert.equal(await details.remove(row.id, c), false)
  })
})

const twoPurchaseOrdersWithTotals = async (c: PoolClient) => {
  const user = await aUser(c)
  const first = await anOrder(c, user, { direction: 'purchase' }).withTotals({ total: 100 })
  const second = await anOrder(c, user, { direction: 'purchase' }).withTotals({ total: 200 })
  return [first, second]
}

test('linking points the ORDER at the account, and only that order', async () => {
  await inRollback(async (c: PoolClient) => {
    const orders = await twoPurchaseOrdersWithTotals(c)
    const mine = orders[0].id

    const row = await anAccount(c)
    const touched = await transactions.update(mine, { payout_details_id: row.id }, {}, c)
    assert.ok(touched, 'the link matched no orders.transactions row')
    const {
      rows: [linked],
    } = await c.query('SELECT payout_details_id FROM orders.transactions WHERE order_id = $1', [
      mine,
    ])
    assert.equal(linked.payout_details_id, row.id)

    if (orders[1]) {
      const {
        rows: [other],
      } = await c.query('SELECT payout_details_id FROM orders.transactions WHERE order_id = $1', [
        orders[1].id,
      ])
      assert.notEqual(
        other.payout_details_id,
        row.id,
        "linking one order changed another order's account"
      )
    }
  })
})

test('linking an order with no transactions row reports it rather than passing', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    const touched = await transactions.update(
      '00000000-0000-0000-0000-000000000000',
      { payout_details_id: row.id },
      {},
      c
    )
    assert.equal(touched, false, 'a link that reached nobody was reported as done')
  })
})

test("getOne nests the linked order's payout fee and waiver", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
    const built = await aPayout(c, user, { order, method: 'ACH', payout_fee: 12.5 })

    const row = await details.getOne(built.id, c)
    assert.equal(row?.id, built.id)
    assert.equal(row?.order?.order_id, order.id)
    assert.equal(Number(row?.order?.payout_fee), 12.5)

    assert.ok(!('account_number' in (row as object)), 'the full account number reached the row')
    assert.ok(!('routing_number' in (row as object)), 'the full routing number reached the row')
  })
})

test('getOne answers no order for an account attached to nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c)
    const read = await details.getOne(row.id, c)
    assert.equal(read?.order, null)
  })
})

test("getMany batches several orders' details in one read, and answers empty for an empty list", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const first = await anOrder(c, user, { direction: 'purchase' })
    const second = await anOrder(c, user, { direction: 'purchase' })
    const firstPayout = await aPayout(c, user, { order: first })
    const secondPayout = await aPayout(c, user, { order: second })

    const rows = await details.getMany([first.id, second.id], c)
    const ids = rows.map((r) => r.id).sort()
    assert.deepEqual(ids, [firstPayout.id, secondPayout.id].sort())

    assert.deepEqual(await details.getMany([], c), [])
  })
})

test('getMany answers empty for an order with no linked details', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
    assert.deepEqual(await details.getMany([order.id], c), [])
  })
})
