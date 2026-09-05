import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAdmin } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

type Entry = {
  address: { id: string }
  user_address: { default_shipping: boolean }
  actions: { edit: boolean; remove: boolean; set_default: boolean }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const newAddressBody = (over: Record<string, unknown> = {}) => ({
  address: {
    line_1: '6100 Main St',
    line_2: null,
    city: 'Houston',
    state: 'TX',
    zip: '77005',
    country: 'United States',
    country_code: 'US',
    phone_number: '7135550100',
    ...over,
  },
  user_address: {
    recipient_name: `journey-${randomUUID().slice(0, 8)}`,
    label: 'Home',
    default_shipping: true,
  },
})

test('a customer creates an address, sees it in their book, edits it, and deletes it', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)

      const created = await as(customer, () =>
        request(app).post('/api/addresses').send(newAddressBody())
      )
      assert.equal(created.status, 201, created.text)
      const addressId = created.body.address.id
      assert.ok(addressId, 'the create answered no address id')
      assert.equal(created.body.address.city, 'Houston')
      assert.equal(created.body.user_address.default_shipping, true)

      const book = await as(customer, () => request(app).get('/api/addresses'))
      assert.equal(book.status, 200)
      const entry = book.body.find((e: Entry) => e.address.id === addressId)
      assert.ok(entry, "the created address is not in the customer's book")
      assert.equal(entry.user_address.default_shipping, true)
      assert.equal(entry.actions.edit, true, 'a free address does not offer to be edited')

      const edited = await as(customer, () =>
        request(app)
          .patch(`/api/addresses/${addressId}`)
          .send({
            address: { ...newAddressBody().address, line_1: '6100 Main St Suite 200' },
          })
      )
      assert.equal(edited.status, 200, edited.text)
      assert.equal(edited.body.address.line_1, '6100 Main St Suite 200')
      assert.equal(
        edited.body.user_address.default_shipping,
        true,
        'editing the address cost it its default'
      )

      const removed = await as(customer, () => request(app).delete(`/api/addresses/${addressId}`))
      assert.equal(removed.status, 200, removed.text)
      assert.equal(removed.body.address.id, addressId, 'the delete did not answer what it removed')

      const after = await as(customer, () => request(app).get('/api/addresses'))
      assert.ok(
        !after.body.some((e: Entry) => e.address.id === addressId),
        'the deleted address is still in the book'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES }
  )
})

test('the ownership rule: a stranger cannot read, edit or delete it; an admin naming the owner can', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const stranger = await aUser(c)
      const admin = await anAdmin(c)

      const created = await as(owner, () =>
        request(app).post('/api/addresses').send(newAddressBody())
      )
      assert.equal(created.status, 201, created.text)
      const addressId = created.body.address.id

      const strangersBook = await as(stranger, () => request(app).get('/api/addresses'))
      assert.ok(
        !strangersBook.body.some((e: Entry) => e.address.id === addressId),
        "a stranger's book contains somebody else's address"
      )

      const strangerEdit = await as(stranger, () =>
        request(app)
          .patch(`/api/addresses/${addressId}`)
          .send({ address: { ...newAddressBody().address, line_1: 'Stolen St' } })
      )
      assert.equal(strangerEdit.status, 404, 'a stranger edited an address that is not theirs')

      const strangerDelete = await as(stranger, () =>
        request(app).delete(`/api/addresses/${addressId}`)
      )
      assert.equal(strangerDelete.status, 404, strangerDelete.text)
      const ownersBookAfter = await as(owner, () => request(app).get('/api/addresses'))
      assert.ok(
        ownersBookAfter.body.some((e: Entry) => e.address.id === addressId),
        "a stranger's delete call removed the owner's address"
      )

      const adminRead = await asAdmin(admin, () =>
        request(app).get(`/api/addresses?user_id=${owner.id}`)
      )
      assert.equal(adminRead.status, 200)
      assert.ok(
        adminRead.body.some((e: Entry) => e.address.id === addressId),
        "an admin naming the owner's id did not see the address"
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES }
  )
})
