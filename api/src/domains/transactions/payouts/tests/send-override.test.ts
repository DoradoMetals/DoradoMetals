import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import { aSessionRow } from '#accounts/auth/tests/harness.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import { STEP_UP_FRESH_SECONDS } from '#accounts/auth/rules.ts'
import * as fake from '#providers/moov/fake.ts'
import * as bankLinks from '#db/payments/bank-links/repo.ts'
import * as payouts from '#transactions/payouts/service.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR

beforeEach(() => fake.reset())
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

async function aPurchase(c: PoolClient, user_id: string, total: number): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, number, user_id)
     VALUES ('purchase', nextval('orders.purchase_number_seq'), $1) RETURNING id`,
    [user_id],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [id, total],
    c
  )
  return id
}

async function aVerifiedAccount(c: PoolClient, user_id: string) {
  return await bankLinks.create(
    {
      user_id,
      provider: 'moov',
      moov_account_id: 'acct_customer',
      moov_bank_account_id: 'bank_1',
      payment_method_id: 'pm_customer',
      rail: 'ACH',
      holder_name: 'Test Holder',
      bank_name: 'Test Bank',
      last_four: '4321',
      status: 'verified',
      linked_by: 'plaid',
    },
    c
  )
}

test('sending a payout that is not in its opening state needs a reason AND a fresh session', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      await payouts.sendPayout(opened.id)

      const stale = await aSessionRow(c, admin.id, STEP_UP_FRESH_SECONDS + 60)
      await asAdmin({ ...admin, session_id: stale }, async () => {
        const noReason = await request(app)
          .post(`/api/payments/payouts/${opened.id}/send`)
          .send({})
        assert.equal(
          noReason.status,
          409,
          'sending an already-processing payout with no reason was not refused'
        )

        const staleWithReason = await request(app)
          .post(`/api/payments/payouts/${opened.id}/send`)
          .send({ override_reason: 'admin retried after a provider timeout, confirmed by phone' })
        assert.equal(
          staleWithReason.status,
          403,
          'a stale session with a reason still got through step_up_required'
        )
      })

      await authSessions.update(stale, { stepped_up_at: new Date().toISOString() }, c)
      await asAdmin({ ...admin, session_id: stale }, async () => {
        const steppedUp = await request(app)
          .post(`/api/payments/payouts/${opened.id}/send`)
          .send({ override_reason: 'admin retried after a provider timeout, confirmed by phone' })
        assert.equal(
          steppedUp.status,
          200,
          `a reason plus a stepped-up session was still refused: ${steppedUp.text}`
        )
      })

      assert.equal(
        fake.recorded().filter((call) => call.what === 'createTransfer').length,
        2,
        'the override should have re-sent the transfer to the provider'
      )
    },
    { lock: LOCKS.ORDERS }
  )
})
