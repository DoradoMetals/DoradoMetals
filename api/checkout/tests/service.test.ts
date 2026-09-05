import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anAddress } from '#shared/testing/builders/index.ts'
import * as service from '#checkout/service.ts'

afterAll(async () => {
  await pool.end()
})

test('a fresh sale checkout adopts the only valid address in the book', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const address = await anAddress(c, customer)

      const row = await service.getRowFor(customer.id, 'sale', c)

      assert.equal(
        row.recipient_address_id,
        address.id,
        "a fresh sale checkout should adopt the customer's only address automatically"
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] }
  )
})

test('a fresh sale checkout is left unaddressed when the book is empty', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const row = await service.getRowFor(customer.id, 'sale', c)
      assert.equal(row.recipient_address_id, null)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] }
  )
})
