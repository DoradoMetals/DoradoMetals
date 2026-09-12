import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'

import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'

// Migration 172 is the subject, so the test runs THE MIGRATION - not a
// re-implementation of its rule in TypeScript. A copy of the rule would pass
// while the file production runs says something else, which is the one failure
// a backfill test exists to prevent.
const MIGRATION = fs.readFileSync(
  path.join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'migrations',
    '172_backfill_sign_in_phones_from_the_address_book.sql'
  ),
  'utf8'
)

const LOCK = [LOCKS.USERS, LOCKS.ADDRESSES, LOCKS.ORDERS]
const OPTIONS = { lock: LOCK, actor: TEST_ACTOR.id }

const run = async (c: PoolClient): Promise<void> => {
  await c.query(MIGRATION)
}

// 555-01xx is the reserved fictional range; the last four keep two tests in the
// same database from handing each other a collision that is not the subject.
let minted = 0
const aPhone = (): { e164: string; typed: string } => {
  minted += 1
  const last = String(1000 + ((Date.now() + minted * 7919) % 8999))
  return { e164: `+1959555${last}`, typed: `(959) 555-${last}` }
}

const signIn = async (
  c: PoolClient,
  id: string
): Promise<{ phone_number: string | null; phone_number_verified: boolean }> => {
  const { rows } = await c.query<{ phone_number: string | null; phone_number_verified: boolean }>(
    `SELECT phone_number, phone_number_verified FROM auth.users WHERE id = $1`,
    [id]
  )
  return rows[0]!
}

const createdAt = (c: PoolClient, address_id: string, when: string) =>
  c.query(`UPDATE places.addresses SET created_at = $2 WHERE id = $1`, [address_id, when])

const orderedAt = (c: PoolClient, order_id: string, when: string) =>
  c.query(`UPDATE orders.orders SET created_at = $2 WHERE id = $1`, [order_id, when])

// THE RULE. The address a parcel actually went to wins, and the default-shipping
// flag is not consulted - a book entry can be flagged default and still be a
// relative's house, while an address FedEx delivered to is a number the customer
// answered.
test('the number comes from the address an order went to, not the default one', async () => {
  await inPinnedTransaction(async (c) => {
    const user = await aUser(c, { phone_number: null })
    const ordered = aPhone()
    const never = aPhone()

    const home = await anAddress(c, user, { phone_number: never.typed, default_shipping: true })
    const work = await anAddress(c, user, { phone_number: ordered.typed, default_shipping: false })
    await createdAt(c, home.id, '2024-01-01T00:00:00Z')
    await createdAt(c, work.id, '2025-06-01T00:00:00Z')
    await anOrder(c, user).withAddress(work)

    await run(c)

    const row = await signIn(c, user.id)
    assert.equal(row.phone_number, ordered.e164, 'the typed number is normalised to US E.164')
    assert.equal(row.phone_number_verified, false, 'nobody has answered a code on it yet')
  }, OPTIONS)
})

test('when two addresses have both been ordered against, the most recent order wins', async () => {
  await inPinnedTransaction(async (c) => {
    const user = await aUser(c, { phone_number: null })
    const older = aPhone()
    const newer = aPhone()

    const first = await anAddress(c, user, { phone_number: older.typed, default_shipping: true })
    const second = await anAddress(c, user, {
      phone_number: newer.typed,
      default_shipping: false,
    })
    await createdAt(c, first.id, '2024-01-01T00:00:00Z')
    await createdAt(c, second.id, '2024-02-01T00:00:00Z')

    const early = await anOrder(c, user, { direction: 'purchase' }).withAddress(first)
    const late = await anOrder(c, user, { direction: 'sale' }).withAddress(second)
    await orderedAt(c, early.id, '2024-03-01T00:00:00Z')
    await orderedAt(c, late.id, '2025-09-01T00:00:00Z')

    await run(c)

    assert.equal((await signIn(c, user.id)).phone_number, newer.e164)
  }, OPTIONS)
})

test('a customer with no orders takes the number from their earliest address', async () => {
  await inPinnedTransaction(async (c) => {
    const user = await aUser(c, { phone_number: null })
    const first = aPhone()
    const later = aPhone()

    const earliest = await anAddress(c, user, {
      phone_number: first.typed,
      default_shipping: false,
    })
    const newest = await anAddress(c, user, { phone_number: later.typed, default_shipping: true })
    await createdAt(c, earliest.id, '2023-05-05T00:00:00Z')
    await createdAt(c, newest.id, '2026-05-05T00:00:00Z')

    await run(c)

    assert.equal((await signIn(c, user.id)).phone_number, first.e164)
  }, OPTIONS)
})

test('a customer who already has a sign-in number is never overwritten', async () => {
  await inPinnedTransaction(async (c) => {
    const theirs = aPhone()
    const onTheParcel = aPhone()
    const user = await aUser(c, { phone_number: theirs.e164 })
    await c.query(`UPDATE auth.users SET phone_number_verified = true WHERE id = $1`, [user.id])

    const address = await anAddress(c, user, { phone_number: onTheParcel.typed })
    await anOrder(c, user).withAddress(address)

    await run(c)

    const row = await signIn(c, user.id)
    assert.equal(row.phone_number, theirs.e164, 'the number they sign in with stands')
    assert.equal(row.phone_number_verified, true, 'and the proof of it is not reset')
  }, OPTIONS)
})

// A household shares a landline. The unique index means only one of them can
// sign in with it and a migration must not pick which.
test('two customers who would receive the same number are both left for a human', async () => {
  await inPinnedTransaction(async (c) => {
    const shared = aPhone()
    const one = await aUser(c, { phone_number: null })
    const two = await aUser(c, { phone_number: null })

    // Typed differently on each address, so the collision is only visible AFTER
    // normalisation - which is the point at which it has to be caught.
    await anAddress(c, one, { phone_number: shared.typed })
    await anAddress(c, two, { phone_number: `1-959-555-${shared.e164.slice(-4)} ` })

    await run(c)

    assert.equal((await signIn(c, one.id)).phone_number, null)
    assert.equal((await signIn(c, two.id)).phone_number, null)
  }, OPTIONS)
})

test('a number that is already somebody else’s sign-in is not taken from them', async () => {
  await inPinnedTransaction(async (c) => {
    const held = aPhone()
    const owner = await aUser(c, { phone_number: held.e164 })
    const newcomer = await aUser(c, { phone_number: null })
    await anAddress(c, newcomer, { phone_number: held.typed })

    await run(c)

    assert.equal((await signIn(c, newcomer.id)).phone_number, null, 'the newcomer is left alone')
    assert.equal((await signIn(c, owner.id)).phone_number, held.e164, 'and the owner keeps it')
  }, OPTIONS)
})

test('a number that is not a US number is not carried at all', async () => {
  await inPinnedTransaction(async (c) => {
    for (const typed of ['+44 20 7946 0958', '555-0134', '(959) 555-0134 ext 22', '0595550134']) {
      const user = await aUser(c, { phone_number: null })
      await anAddress(c, user, { phone_number: typed })
      await run(c)
      assert.equal((await signIn(c, user.id)).phone_number, null, `${typed} is not a sign-in`)
    }
  }, OPTIONS)
})

test('running it twice changes nothing', async () => {
  await inPinnedTransaction(async (c) => {
    const filled = aPhone()
    const shared = aPhone()
    const takes = await aUser(c, { phone_number: null })
    const one = await aUser(c, { phone_number: null })
    const two = await aUser(c, { phone_number: null })

    await anAddress(c, takes, { phone_number: filled.typed })
    await anAddress(c, one, { phone_number: shared.typed })
    await anAddress(c, two, { phone_number: shared.typed })

    await run(c)
    const after = await signIn(c, takes.id)
    assert.equal(after.phone_number, filled.e164)

    await run(c)

    assert.deepEqual(await signIn(c, takes.id), after, 'the filled customer is untouched')
    assert.equal((await signIn(c, one.id)).phone_number, null, 'and a collision stays a collision')
    assert.equal((await signIn(c, two.id)).phone_number, null)
  }, OPTIONS)
})
