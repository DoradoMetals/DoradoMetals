import { test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import * as fake from '#providers/plaid/fake.ts'

beforeEach(() => fake.reset())

const entry = (id: string, amount: number) => ({
  transaction_id: id,
  amount,
  date: '2026-09-05',
  name: 'DORADO METALS WIRE SO-1234',
  merchant_name: null,
  pending: false,
  account_id: 'truist-1',
})

test('a link token is minted for the customer that asked for it', async () => {
  const minted = await fake.data.createLinkToken('user-1')
  assert.ok(minted.link_token.startsWith('link-sandbox-'))
  assert.equal(fake.recorded()[0]?.detail, 'user-1')
})

test('a public token exchanges for an access token and an item', async () => {
  const exchanged = await fake.data.exchangePublicToken('public-sandbox-1')
  assert.ok(exchanged.access_token.startsWith('access-sandbox-'))
  assert.ok(exchanged.item_id.startsWith('item-'))
})

test('a processor token is minted for Moov', async () => {
  const minted = await fake.data.createProcessorToken('access-sandbox-1', 'acct-1')
  assert.ok(minted.processor_token.startsWith('processor-sandbox-'))
})

test('sync hands back the fed page and advances the cursor', async () => {
  fake.feed([entry('txn-1', -500)])
  const page = await fake.data.syncTransactions('access-sandbox-1', null)
  assert.equal(page.added.length, 1)
  assert.ok(page.next_cursor.startsWith('cursor-'))

  const empty = await fake.data.syncTransactions('access-sandbox-1', page.next_cursor)
  assert.deepEqual(empty.added, [])
  assert.equal(empty.next_cursor, page.next_cursor)
})
