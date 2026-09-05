import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as service from '#accounts/places/addresses/service.ts'

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

const twoPeople = async (c: PoolClient) => ({
  owner: (await aUser(c, { name: 'Address Owner' })).id,
  stranger: (await aUser(c, { name: 'A Stranger' })).id,
})

const pinned = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const address = (over: Record<string, unknown> = {}) => ({
  line_1: '1 Test Street',
  line_2: null,
  city: 'Austin',
  state: 'TX',
  country: 'United States',
  zip: '78701',
  country_code: 'US',
  phone_number: '5550000000',
  ...over,
})

const link = (over: Record<string, unknown> = {}) => ({
  recipient_name: `probe-${randomUUID().slice(0, 8)}`,
  label: 'Home',
  ...over,
})

test('create writes the address and its link under one id', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const ua = link()
    const made = await service.create(owner, address(), ua)

    assert.ok(made.address.id)
    assert.equal(made.address.line_1, '1 Test Street')
    assert.equal(made.user_address.recipient_name, ua.recipient_name)
    assert.equal(made.user_address.user_id, owner)

    const { rows: addr } = await c.query('SELECT id FROM places.addresses WHERE id = $1', [
      made.address.id,
    ])
    const { rows: row } = await c.query(
      'SELECT user_id, recipient_name, label FROM places.user_addresses WHERE address_id = $1',
      [made.address.id]
    )
    assert.equal(addr.length, 1, 'no postal address was written')
    assert.equal(row.length, 1, 'no link was written')
    assert.equal(row[0].user_id, owner)
    assert.equal(row[0].recipient_name, ua.recipient_name, 'the recipient did not reach the link')
    assert.equal(row[0].label, 'Home', 'the nickname did not reach the link')
  })
})

test('a new address is valid and non-residential until validation says otherwise', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    assert.equal(made.address.is_valid, true)
    assert.equal(made.address.is_residential, false)

    const { rows } = await c.query(
      'SELECT is_valid, is_residential FROM places.addresses WHERE id = $1',
      [made.address.id]
    )
    assert.equal(rows[0].is_valid, true)
    assert.equal(rows[0].is_residential, false)
  })
})

test('the first address in a book is the default even when the caller says no', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const first = await service.create(owner, address(), link({ default_shipping: false }))
    assert.equal(first.user_address.default_shipping, true)
    assert.equal(first.actions.set_default, false, 'the default offers to become one')

    const second = await service.create(owner, address(), link({ default_shipping: false }))
    assert.equal(second.user_address.default_shipping, false, 'the second address took the default')
  })
})

test("the list is that person's entries, defaults first", async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    await service.create(owner, address(), link())
    const marked = await service.create(owner, address(), link({ default_shipping: true }))

    const rows = await service.list(owner)
    assert.ok(rows.length >= 2)

    const marks = rows.map((r) => r.user_address.default_shipping === true)
    assert.equal(
      marks.indexOf(false) === -1 || marks.lastIndexOf(true) < marks.indexOf(false),
      true,
      'a non-default entry sorted above a default one'
    )
    assert.equal(
      rows[0].address.id,
      marked.address.id,
      'the address just marked default did not sort first'
    )

    for (const row of rows) {
      assert.equal(row.user_address.user_id, owner)
      assert.deepEqual(Object.keys(row.user_address).sort(), [
        'address_id',
        'default_shipping',
        'label',
        'recipient_name',
        'user_id',
      ])
      assert.deepEqual(Object.keys(row.actions).sort(), ['edit', 'remove', 'set_default'])
    }
  })
})

test("an address with no link is not in anybody's list", async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const id = randomUUID()
    await c.query(
      'INSERT INTO places.addresses (id, line_1, city, state) VALUES ($1, $2, $3, $4)',
      [id, 'orphan', 'Austin', 'TX']
    )
    const rows = await service.list(owner)
    assert.ok(!rows.some((r) => r.address.id === id), 'an unlinked address reached a list')
    await assert.rejects(() => service.getOne(id, owner), /address book/)
  })
})

test('getAddressFromId answers the row, not an entry', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())

    const one = await service.getAddressFromId(made.address.id)
    assert.ok(one, `getAddressFromId could not read back address ${made.address.id}`)
    assert.equal(one.state, 'TX')
    assert.ok(!('user_address' in one), 'getAddressFromId started returning an entry')
  })
})

test('update changes the address and its link', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    const updated = await service.update(made.address.id, owner, address({ city: 'Dallas' }), {
      recipient_name: 'renamed',
      default_shipping: true,
    })

    assert.equal(updated.address.city, 'Dallas')
    assert.equal(updated.user_address.recipient_name, 'renamed')
    assert.equal(updated.user_address.default_shipping, true)

    const { rows } = await c.query(
      `SELECT a.city, ua.recipient_name, ua.default_shipping
         FROM places.addresses a
         JOIN places.user_addresses ua ON ua.address_id = a.id
        WHERE a.id = $1`,
      [made.address.id]
    )
    assert.equal(rows[0].city, 'Dallas', 'the row still holds the old city')
    assert.equal(rows[0].recipient_name, 'renamed', 'the recipient did not reach the link')
    assert.equal(rows[0].default_shipping, true, 'default_shipping did not land')
  })
})

test('editing an address does not cost it its default', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    const after = await service.update(made.address.id, owner, undefined, {
      recipient_name: 'still the default',
    })
    assert.equal(after.user_address.default_shipping, true)
  })
})

test("a stranger cannot update somebody else's address", async () => {
  await pinned(async (c) => {
    const { owner, stranger } = await twoPeople(c)
    const made = await service.create(owner, address(), link())

    await assert.rejects(
      () => service.update(made.address.id, stranger, address({ city: 'Stolen' }), undefined),
      /address book/
    )

    const { rows: nx } = await c.query('SELECT city FROM places.addresses WHERE id = $1', [
      made.address.id,
    ])
    assert.equal(nx[0].city, 'Austin', 'a stranger rewrote the address')
  })
})

test("a stranger's delete is refused rather than answered", async () => {
  await pinned(async (c) => {
    const { owner, stranger } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    await assert.rejects(() => service.remove(made.address.id, stranger), /address book/)

    const { rows } = await c.query(
      'SELECT 1 FROM places.user_addresses WHERE address_id = $1 AND user_id = $2',
      [made.address.id, owner]
    )
    assert.equal(rows.length, 1, "a stranger deleted somebody else's link")
  })
})

test('deleting removes the link and the address, and answers the entry it removed', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    const gone = await service.remove(made.address.id, owner)
    assert.equal(gone.address.id, made.address.id)

    const { rows: row } = await c.query(
      'SELECT 1 FROM places.user_addresses WHERE address_id = $1',
      [made.address.id]
    )
    const { rows: addr } = await c.query('SELECT 1 FROM places.addresses WHERE id = $1', [
      made.address.id,
    ])
    assert.equal(row.length, 0)
    assert.equal(addr.length, 0)
  })
})

test('an address an order points at survives being removed from a book', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())

    const order = await anOrder(
      c,
      { id: owner },
      { direction: 'purchase', status: 'Completed' }
    ).withAddress({ id: made.address.id })
    const {
      rows: [orderLink],
    } = await c.query('SELECT id FROM orders.addresses WHERE order_id = $1', [order.id])
    assert.ok(orderLink, 'the order was built without its address snapshot')

    await service.remove(made.address.id, owner)

    const { rows: row } = await c.query(
      'SELECT 1 FROM places.user_addresses WHERE address_id = $1',
      [made.address.id]
    )
    const { rows: addr } = await c.query('SELECT 1 FROM places.addresses WHERE id = $1', [
      made.address.id,
    ])
    assert.equal(row.length, 0, 'the link should still go')
    assert.equal(addr.length, 1, 'the address an order snapshotted was deleted with the link')
  })
})

test('setting a default clears the others', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const first = await service.create(owner, address(), link({ default_shipping: true }))
    const second = await service.create(owner, address(), link())

    const now = await service.setDefault(second.address.id, owner)
    assert.equal(now.user_address.default_shipping, true)

    const { rows: nx } = await c.query(
      `SELECT address_id, default_shipping, default_billing
         FROM places.user_addresses WHERE user_id = $1`,
      [owner]
    )
    assert.ok(nx.length >= 2, 'the addresses just created are not in the book')
    for (const row of nx) {
      const expected = row.address_id === second.address.id
      assert.equal(row.default_shipping, expected, 'default_shipping is wrong somewhere')
      assert.equal(row.default_billing, expected, 'default_billing did not follow')
    }
    assert.ok(
      nx.some((r) => r.address_id === first.address.id && r.default_shipping === false),
      'the address that used to be the default is still one'
    )
  })
})

test('an address on an unfinished order can be neither edited nor deleted, and says so', async () => {
  await pinned(async (c) => {
    const { owner } = await twoPeople(c)
    const made = await service.create(owner, address(), link())
    await anOrder(c, { id: owner }, { direction: 'purchase', status: 'Pending' }).withAddress({
      id: made.address.id,
    })

    assert.equal(await service.isActive(made.address.id, owner), true)

    const entry = (await service.list(owner)).find((e) => e.address.id === made.address.id)
    assert.ok(entry, 'the locked address left the book')
    assert.equal(entry.actions.edit, false, 'a locked entry still offers edit')
    assert.equal(entry.actions.remove, false, 'a locked entry still offers remove')

    await assert.rejects(
      () => service.update(made.address.id, owner, address({ city: 'Nope' }), undefined),
      /associated with an active order/
    )
    await assert.rejects(
      () => service.remove(made.address.id, owner),
      /associated with an active order/
    )
  })
})
