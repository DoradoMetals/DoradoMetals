import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as moovFake from '#providers/payments/moov/fake.ts'
import * as plaidFake from '#providers/payments/plaid/fake.ts'
import * as banks from '#transactions/banks/service.ts'
import * as payouts from '#transactions/payouts/service.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'

beforeEach(() => {
  moovFake.reset()
  plaidFake.reset()
})
afterAll(async () => {
  await pool.end()
})

test('a Plaid link is exchanged for a processor token and vaulted at Moov', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const link = await banks.linkFromPlaid(user.id, {
        public_token: 'public-sandbox-1',
        account_id: 'plaid-acct-1',
        rail: 'ACH',
      })

      assert.equal(link.status, 'verified')
      assert.equal(link.linked_by, 'plaid')
      assert.equal(link.last_four, '4321')
      assert.equal(link.moov_account_id, 'acct_platform')

      const asked = plaidFake.recorded().map((call) => call.what)
      assert.deepEqual(asked, ['exchangePublicToken', 'createProcessorToken'])
      assert.ok(
        moovFake.recorded().some((call) => call.what === 'linkByProcessorToken'),
        'the processor token never reached Moov'
      )
    },
    { lock: LOCKS.USERS }
  )
})

test('a Plaid link keeps no bank numbers of its own', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const link = await banks.linkFromPlaid(user.id, {
        public_token: 'public-sandbox-1',
        account_id: 'plaid-acct-1',
        rail: 'ACH',
      })
      const columns = Object.keys(link).join(' ')
      assert.equal(/routing|account_number/.test(columns), false, columns)
    },
    { lock: LOCKS.USERS }
  )
})

test('micro deposits leave the link pending until the amounts are confirmed', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const pending = await banks.linkByMicroDeposits(user.id, {
        holder_name: 'Test Holder',
        account_type: 'checking',
        routing_number: '021000021',
        account_number: '000123456789',
        rail: 'ACH',
      })
      assert.equal(pending.status, 'pending')
      assert.equal(pending.last_four, '6789')
      assert.equal(pending.payment_method_id, null)

      const verified = await banks.verifyMicroDeposits(user.id, pending.id, { amounts: [12, 34] })
      assert.equal(verified.status, 'verified')
      assert.ok(verified.payment_method_id, 'a verified link caches its Moov payment method')
    },
    { lock: LOCKS.USERS }
  )
})

test('one customer may not verify another customer bank link', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const stranger = await aUser(c)
      const link = await banks.linkByMicroDeposits(owner.id, {
        holder_name: 'Test Holder',
        account_type: 'checking',
        routing_number: '021000021',
        account_number: '000123456789',
        rail: 'ACH',
      })

      await assert.rejects(
        async () => await banks.verifyMicroDeposits(stranger.id, link.id, { amounts: [1, 2] }),
        /no bank link/
      )
    },
    { lock: LOCKS.USERS }
  )
})

test('the Pay to list caches the Moov payment method on the row', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const pending = await banks.linkByMicroDeposits(user.id, {
        holder_name: 'Test Holder',
        account_type: 'checking',
        routing_number: '021000021',
        account_number: '000123456789',
        rail: 'ACH',
      })
      moovFake.offerPaymentMethods('acct_platform', [
        {
          paymentMethodID: 'pm_cached',
          paymentMethodType: 'ach-credit-standard',
          bankName: 'Micro Deposit Bank',
          lastFourAccountNumber: '6789',
        },
      ])

      const offered = await payouts.payTo(user.id)
      assert.equal(offered.length, 1)
      assert.equal(offered[0]?.payment_method_id, 'pm_cached')
      assert.equal(offered[0]?.id, pending.id)

      await payouts.payTo(user.id)
      assert.equal(
        moovFake.recorded().filter((call) => call.what === 'paymentMethods').length,
        1,
        'the second read comes off the row, not the provider'
      )
    },
    { lock: LOCKS.USERS }
  )
})

test('the Pay to list returns no vendor account ids to the wire', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      await banks.linkFromPlaid(user.id, {
        public_token: 'public-sandbox-1',
        account_id: 'plaid-acct-1',
        rail: 'ACH',
      })
      const offered = await payouts.payTo(user.id)
      assert.equal(offered.length, 1)
      assert.equal('moov_account_id' in (offered[0] as object), false)
      assert.equal('user_id' in (offered[0] as object), false)
    },
    { lock: LOCKS.USERS }
  )
})
