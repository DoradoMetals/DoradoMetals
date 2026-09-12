import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'
import * as userAddresses from '#db/places/user-addresses/repo.ts'
import { AddressBookEntryFacts } from '@dorado/contracts'

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

const inRollback = rollbackIn({ lock: [LOCKS.ADDRESSES, LOCKS.ORDERS] })

test('the address book view parses through AddressBookEntryFacts', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const built = await anAddress(c, user, { recipient_name: 'Ada', label: 'Home' })

    const [entry] = await userAddresses.view(user.id, built.id, c)
    assert.ok(entry, 'the view read nothing back')
    AddressBookEntryFacts.parse(entry)

    assert.equal(entry.address.id, built.id)
    assert.equal(entry.user_address.recipient_name, 'Ada')
    assert.equal(entry.user_address.label, 'Home')
    assert.equal(entry.locked, false)
    assert.ok(!('default_billing' in entry.user_address), 'default_billing reached the wire')
  })
})

test('locked is the EXISTS of an unfinished order on that address', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const built = await anAddress(c, user)
    await anOrder(c, user, { direction: 'purchase' }).withAddress(built)

    const [entry] = await userAddresses.view(user.id, built.id, c)
    assert.equal(entry?.locked, true, 'an address on a live order is not locked')
  })
})

test("the book is that person's entries, defaults first", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const first = await anAddress(c, user, { recipient_name: 'Zoe', default_shipping: false })
    const marked = await anAddress(c, user, { recipient_name: 'Ada', default_shipping: true })

    const book = await userAddresses.view(user.id, null, c)
    const ids = book.map((e) => e.address.id)
    assert.ok(ids.includes(first.id) && ids.includes(marked.id))
    assert.equal(book[0]!.user_address.default_shipping, true, 'the default did not sort first')
  })
})
